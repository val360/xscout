package net.val360.xscout;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.stream.Collectors;

public class App {
    private static final List<String> DEFAULT_TICKERS = Arrays.asList(
        "AAPL", "MSFT", "GOOG", "AMZN", "NVDA", "TSLA"
    );

    public static void main(String[] args) throws IOException {
        CliOptions options = CliOptions.parse(args);
        NasdaqStockDataClient client = new NasdaqStockDataClient();

        List<StockSnapshot> snapshots = new ArrayList<>();
        for (String ticker : options.tickers) {
            StockSnapshot snapshot = client.fetchSnapshot(ticker);
            if (snapshot != null) {
                snapshots.add(snapshot);
            }
        }

        if (snapshots.isEmpty()) {
            System.out.println("No stock data could be fetched.");
            return;
        }

        snapshots.sort(options.sortBy.comparator);
        if (options.descending) {
            snapshots.sort(options.sortBy.comparator.reversed());
        }

        System.out.println("Stock Watchlist");
        System.out.println("Sort: " + options.sortBy.label + (options.descending ? " (desc)" : " (asc)"));
        System.out.println();
        printTable(snapshots);
    }

    private static void printTable(List<StockSnapshot> snapshots) {
        String headerFormat = "%-8s %10s %12s %8s %8s %8s %8s %8s%n";
        String rowFormat = "%-8s %10s %12s %8s %8s %8s %8s %8s%n";

        System.out.printf(
            headerFormat,
            "Ticker", "Price", "Market Cap", "1D", "5D", "2W", "1M", "3M"
        );
        System.out.println(
            "--------------------------------------------------------------------------------"
        );

        for (StockSnapshot snapshot : snapshots) {
            System.out.printf(
                rowFormat,
                snapshot.ticker,
                formatCurrency(snapshot.price),
                formatMarketCap(snapshot.marketCap),
                formatPercent(snapshot.change1d),
                formatPercent(snapshot.change5d),
                formatPercent(snapshot.change2w),
                formatPercent(snapshot.change1m),
                formatPercent(snapshot.change3m)
            );
        }
    }

    private static String formatCurrency(double value) {
        if (Double.isNaN(value)) {
            return "N/A";
        }
        return String.format(Locale.US, "$%,.2f", value);
    }

    private static String formatMarketCap(double value) {
        if (Double.isNaN(value) || value <= 0) {
            return "N/A";
        }
        if (value >= 1_000_000_000_000.0) {
            return String.format(Locale.US, "$%.2fT", value / 1_000_000_000_000.0);
        }
        if (value >= 1_000_000_000.0) {
            return String.format(Locale.US, "$%.2fB", value / 1_000_000_000.0);
        }
        if (value >= 1_000_000.0) {
            return String.format(Locale.US, "$%.2fM", value / 1_000_000.0);
        }
        return String.format(Locale.US, "$%,.0f", value);
    }

    private static String formatPercent(double value) {
        if (Double.isNaN(value)) {
            return "N/A";
        }
        return String.format(Locale.US, "%+.2f%%", value);
    }

    private static final class CliOptions {
        private final List<String> tickers;
        private final SortBy sortBy;
        private final boolean descending;

        private CliOptions(List<String> tickers, SortBy sortBy, boolean descending) {
            this.tickers = tickers;
            this.sortBy = sortBy;
            this.descending = descending;
        }

        private static CliOptions parse(String[] args) {
            List<String> tickers = new ArrayList<>(DEFAULT_TICKERS);
            SortBy sortBy = SortBy.TICKER;
            boolean descending = false;

            for (String arg : args) {
                if (arg.startsWith("--tickers=")) {
                    String tickerArg = arg.substring("--tickers=".length());
                    List<String> parsedTickers = Arrays.stream(tickerArg.split(","))
                        .map(String::trim)
                        .map(String::toUpperCase)
                        .filter(s -> !s.isEmpty())
                        .collect(Collectors.toList());
                    if (!parsedTickers.isEmpty()) {
                        tickers = parsedTickers;
                    }
                } else if (arg.startsWith("--sort=")) {
                    sortBy = SortBy.from(arg.substring("--sort=".length()));
                } else if ("--desc".equals(arg)) {
                    descending = true;
                } else if ("--help".equals(arg)) {
                    printHelpAndExit();
                }
            }

            return new CliOptions(tickers, sortBy, descending);
        }

        private static void printHelpAndExit() {
            System.out.println("Usage: mvn compile exec:java -Dexec.args=\"[options]\"");
            System.out.println();
            System.out.println("Options:");
            System.out.println("  --tickers=AAPL,MSFT,TSLA   Comma-separated ticker list");
            System.out.println("  --sort=ticker|price|marketcap");
            System.out.println("  --desc                     Sort descending");
            System.out.println("  --help                     Show this message");
            System.exit(0);
        }
    }

    private enum SortBy {
        TICKER("ticker", Comparator.comparing(a -> a.ticker)),
        PRICE("price", Comparator.comparingDouble(a -> a.price)),
        MARKET_CAP("marketcap", Comparator.comparingDouble(a -> a.marketCap));

        private final String label;
        private final Comparator<StockSnapshot> comparator;

        SortBy(String label, Comparator<StockSnapshot> comparator) {
            this.label = label;
            this.comparator = comparator;
        }

        private static SortBy from(String input) {
            for (SortBy value : values()) {
                if (value.label.equalsIgnoreCase(input.trim())) {
                    return value;
                }
            }
            System.out.println("Unknown sort option: " + input + " (defaulting to ticker)");
            return TICKER;
        }
    }
}
