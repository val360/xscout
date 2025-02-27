package net.val360.xscout;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.EnumSet;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;
import org.java_websocket.client.WebSocketClient;
import org.java_websocket.handshake.ServerHandshake;
import org.json.JSONObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * A WebSocket client for the XRP ledger.
 * Subscribe to streams with subscribe() or send commands and wait for
 * a response with sendCommand().
 * @author smelis
 */
public final class XRPLedgerClient extends WebSocketClient {

    private static final Logger LOG = LoggerFactory.getLogger(XRPLedgerClient.class);

    private static final String COMMAND = "command";
    private static final String STREAMS = "streams";
    private static final String CMD_SUBSCRIBE = "subscribe";
    private static final String CMD_UNSUBSCRIBE = "unsubscribe";
    private static final String ATTRIBUTE_TYPE = "type";
    private static final String ATTRIBUTE_ID = "id";

    private final Map<StreamSubscription, StreamSubscriber> activeSubscriptions = new ConcurrentHashMap<>();
    private final Map<String, CommandListener> commandListeners = new ConcurrentHashMap<>();

    private volatile boolean closeWhenComplete = false;

    public XRPLedgerClient(URI serverUri) {
        super(serverUri);
    }

    public XRPLedgerClient(String serverUri) throws URISyntaxException {
        this(new URI(serverUri));
    }

    public String sendCommand(String command, CommandListener listener) throws InvalidStateException {
        return sendCommand(command, null, listener);
    }

    public String sendCommand(String command, Map<String, Object> parameters, CommandListener listener) throws InvalidStateException {
        checkOpen();
        String id = UUID.randomUUID().toString();

        JSONObject request = new JSONObject();
        request.put(COMMAND, command);
        request.put("id", id);

        if (parameters != null && !parameters.isEmpty()) {
            parameters.forEach(request::put);
        }

        send(request.toString());
        commandListeners.put(id, listener);

        return id;
    }

    @Override
    public void send(String message) {
        LOG.info("Sending message: {}", message);
        super.send(message);
    }

    public void subscribe(EnumSet<StreamSubscription> streams, StreamSubscriber subscriber) throws InvalidStateException {
        checkOpen();
        LOG.info("Subscribing to: {}", streams);
        send(composeSubscribe(CMD_SUBSCRIBE, streams));
        streams.forEach(t -> activeSubscriptions.put(t, subscriber));
    }

    public void unsubscribe(EnumSet<StreamSubscription> streams) throws InvalidStateException {
        checkOpen();
        LOG.info("Unsubscribing from: {}", streams);
        send(composeSubscribe(CMD_UNSUBSCRIBE, streams));
        streams.forEach(activeSubscriptions::remove);
    }

    private String composeSubscribe(String command, EnumSet<StreamSubscription> streams) {
        JSONObject request = new JSONObject();
        request.put(COMMAND, command);
        request.put(STREAMS, streams.stream().map(StreamSubscription::getName).collect(Collectors.toList()));
        return request.toString();
    }

    private void checkOpen() throws InvalidStateException {
        if (!isOpen()) {
            throw new InvalidStateException();
        }
    }

    public EnumSet<StreamSubscription> getActiveSubscriptions() {
        return activeSubscriptions.isEmpty() ? EnumSet.noneOf(StreamSubscription.class) : EnumSet.copyOf(activeSubscriptions.keySet());
    }

    public void closeWhenComplete() {
        closeWhenComplete = true;
    }

    @Override
    public void onOpen(ServerHandshake handshake) {
        handshake.iterateHttpFields().forEachRemaining(LOG::debug);
        LOG.info("XRP ledger client opened");
    }

    @Override
    public void onMessage(String message) {
        long start = System.currentTimeMillis();
        LOG.info("XRPL client received a message:\n{}", message);
        JSONObject json = new JSONObject(message);

        if (json.has(ATTRIBUTE_TYPE) && (StreamSubscription.byMessageType(json.getString(ATTRIBUTE_TYPE)) != null)) {
            StreamSubscription subscription = StreamSubscription.byMessageType(json.getString(ATTRIBUTE_TYPE));
            StreamSubscriber subscriber = activeSubscriptions.get(subscription);
            if (subscriber != null) {
                subscriber.onSubscription(subscription, json);
            }
        } else if (json.has(ATTRIBUTE_ID) && commandListeners.get(json.getString(ATTRIBUTE_ID)) != null) {
            commandListeners.get(json.getString(ATTRIBUTE_ID)).onResponse(json);
            commandListeners.remove(json.getString(ATTRIBUTE_ID));
        }

        if (closeWhenComplete && commandListeners.isEmpty() && activeSubscriptions.isEmpty()) {
            close();
        }

        LOG.info("Ledger message processed in {}ms", System.currentTimeMillis() - start);
    }

    @Override
    public void onClose(int code, String reason, boolean remote) {
        LOG.info("XRP ledger client closed (code {}), reason given: {}", code, reason);
        activeSubscriptions.clear();
        commandListeners.clear();
    }

    @Override
    public void onError(Exception exception) {
        LOG.error("XRP ledger client error", exception);
        // clear activeSubscriptions and commandListeners?
        // Is onError always followed by an onClose?
    }

}
