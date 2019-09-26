# xrpl4j
A (limited) Java WebSocket client for the XRP ledger (https://github.com/ripple/rippled).

With this library you can subscribe to the ledger's streams (https://xrpl.org/websocket-api-tool.html#subscribe) to get periodic notifications of server status, transactions, and ledgers.

To get a client:

```java
XRPLedgerClient client = new XRPLedgerClient("wss://s1.ripple.com");
client.connectBlocking();
```

To subscribe to the transaction stream and ledger stream (this should implement StreamSubscriber):

```java
client.subscribe(EnumSet.of(StreamSubscription.TRANSACTIONS, StreamSubscription.LEDGER), this);
```

Receive stream events in the subscriber:

```java
@Override
public void onSubscription(StreamSubscription subscription, JSONObject message) {
    LOG.info("subscription returned a {} message", subscription.getMessageType());
    buffer.offer(message);
}
```
