package net.val360.xscout;

import org.json.JSONObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.net.URISyntaxException;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;

public class App {
	private static final Logger LOG = LoggerFactory.getLogger(App.class);
	private static int txCount = 0;

	public static void main(String[] args) throws URISyntaxException, InterruptedException, InvalidStateException {
		// Get a client.
		XRPLedgerClient client = new XRPLedgerClient("wss://fh.xrpl.ws");
		client.connectBlocking(3000, TimeUnit.MILLISECONDS);

		// Send a command.
		client.sendCommand("ledger_current", (response) -> LOG.info(response.toString(4)));

		// Send a command with parameters.
		Map<String, Object> parameters = new HashMap<>();
		parameters.put("ledger_index", "validated");
		client.sendCommand("ledger", parameters, (response) -> LOG.info(response.toString(4)));

		// Subscribe to the transaction stream (add transactions to a list as they come in).
		client.subscribe(EnumSet.of(StreamSubscription.TRANSACTIONS), App::processMessage);

		// Tell the client to close when there are no more pending responses
		// for commands and all subscriptions have been unsubscribed.
		client.closeWhenComplete();

		// While we still have a connection check if the number of transactions received
		// has reached 100. If it has, then unsubscribe from the transaction stream.
		// This should trigger automatic closing of the client, because of the previous
		// call to closeWhenComplete() (assuming all commands have been responded to).
		int count = 100;
		if (args.length > 0) {
			try {
				count = Integer.parseInt(args[0]);
			} catch (NumberFormatException e) {
				System.out.println("Invalid argument");
				e.printStackTrace();
			}
		}
		while (client.isOpen()) {
			LOG.info("Waiting for messages (transactions received: {})...", txCount);
			Thread.sleep(100);
			if (txCount >= count && !client.getActiveSubscriptions().isEmpty()) {
				client.unsubscribe(client.getActiveSubscriptions());
			}
		}
	}

	private static void processMessage(StreamSubscription subscription, JSONObject message) {
		LOG.info("Got message from subscription {}: {}", subscription.getMessageType(), message);

		JSONObject transaction = message.getJSONObject("transaction");
		String txType = transaction.getString("TransactionType");
		LOG.info("TX_TYPE: {}",txType);
		if (txType.equals("OfferCreate") || txType.equals("Payment") || txType.equals("TrustSet")) {
			System.out.println(transaction);
			txCount++;
		}
	}
}
