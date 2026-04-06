# xscout (Stock Watchlist CLI)

A simple Java CLI stock watchlist that prints a sortable table including:

- Ticker
- Current price
- Market cap
- Performance columns: **1D**, **5D**, **2W**, **1M**, **3M**

The app fetches live quote and chart data from Yahoo Finance public endpoints.

## Run

```bash
mvn compile exec:java
```

## Options

Pass CLI arguments via `-Dexec.args="..."`:

```bash
mvn compile exec:java -Dexec.args="--tickers=AAPL,MSFT,NVDA --sort=marketcap --desc"
```

Supported options:

- `--tickers=AAPL,MSFT,TSLA` comma-separated watchlist (default: `AAPL,MSFT,GOOG,AMZN,NVDA,TSLA`)
- `--sort=ticker|price|marketcap` sort key (default: `ticker`)
- `--desc` descending sort order (default is ascending)
- `--help` show usage
