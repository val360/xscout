# xscout (Stock Watchlist CLI)

xscout is now a Python CLI stock watchlist application powered by `yfinance`.
It prints a sortable table with:

- Ticker
- Current price
- Market cap
- Performance columns: **1D**, **5D**, **2W**, **1M**, **3M**

The app fetches live market data from Yahoo Finance through the `yfinance` library.

## Requirements

- Python 3.10+
- Internet access for Yahoo Finance requests

## Install

```bash
python3 -m pip install -r requirements.txt
```

## Run

```bash
python3 -m xscout
```

## Options

```bash
python3 -m xscout --tickers=AAPL,MSFT,NVDA --sort=marketcap --desc
```

Supported options:

- `--tickers=AAPL,MSFT,TSLA` comma-separated watchlist (default: `AAPL,MSFT,GOOG,AMZN,NVDA,TSLA`)
- `--sort=ticker|price|marketcap` sort key (default: `ticker`)
- `--desc` descending sort order (default is ascending)
- `--help` show usage

## Tests

```bash
python3 -m unittest discover -s tests
```

## Deploying to AWS ECS

A Fargate-ready container image, ECS task definition template, and GitHub
Actions pipeline are provided. See [`deploy/README.md`](deploy/README.md) for
the full setup guide. Quick start:

```bash
docker build -t xscout .
docker run --rm xscout --tickers=AAPL,MSFT,NVDA --sort=marketcap --desc
```
