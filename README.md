# xscout (Stock Watchlist Web App)

xscout is a Flask stock watchlist application powered by `yfinance`.
It accepts a list of ticker symbols and displays:
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

Start the app locally with Flask:

```bash
python3 -m xscout
```

Then open <http://localhost:5000>.

## Deploy With Gunicorn

```bash
gunicorn xscout.app:app
```

The included `Procfile` uses this command for platforms that detect web processes.

## Tests

```bash
python3 -m unittest discover -s tests
```
