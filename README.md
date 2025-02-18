# xscout
Java xrpl monitor - subscribes to the transaction stream until it has received 100 transactions of type: Payment,
TrustSet, or OfferCreate; then closes the client.  Transactions will be printed to stdout in json format.

To execute run following command: `mvn compile exec:java`
