# xscout (Stock Watchlist Web App)

xscout is a Flask + React stock watchlist application powered by `yfinance`.
It lets you arrange ticker lists on a React Flow canvas and displays:
- Ticker
- Current price
- Market cap
- Performance columns: **1D**, **5D**, **2W**, **1M**, **3M**

The app fetches live market data from Yahoo Finance through the `yfinance` library.

## Requirements

- Python 3.10+
- Node.js 22+
- Internet access for Yahoo Finance requests

## Install

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
cd frontend
npm install
```

## Run

Start the Flask API locally:

```bash
.venv/bin/python -m xscout
```

In another terminal, start the React dev server:

```bash
cd frontend
npm run dev
```

Then open the Vite URL printed in the terminal. API requests are proxied to Flask.

## Production Build

Build the React app into Flask's static assets:

```bash
cd frontend
npm run build
```

Then run Flask or Gunicorn and open <http://localhost:5000>.

## Deploy With Gunicorn

```bash
.venv/bin/gunicorn --bind 0.0.0.0:${PORT:-8000} xscout.app:app
```

The included `Dockerfile` builds the React frontend and serves it from the same Flask/Gunicorn service. The `Procfile` binds to `$PORT` for platforms that detect web processes.

## Tests

```bash
.venv/bin/python -m unittest discover -s tests
cd frontend
npm run build
```
