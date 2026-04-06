package net.val360.xscout;

final class StockSnapshot {
    final String ticker;
    final double price;
    final double marketCap;
    final double change1d;
    final double change5d;
    final double change2w;
    final double change1m;
    final double change3m;

    StockSnapshot(
        String ticker,
        double price,
        double marketCap,
        double change1d,
        double change5d,
        double change2w,
        double change1m,
        double change3m
    ) {
        this.ticker = ticker;
        this.price = price;
        this.marketCap = marketCap;
        this.change1d = change1d;
        this.change5d = change5d;
        this.change2w = change2w;
        this.change1m = change1m;
        this.change3m = change3m;
    }
}
