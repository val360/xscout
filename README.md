# xscout (Stock Watchlist Web App)

xscout is a Flask + React stock watchlist application powered by `yfinance`.
It lets you arrange ticker lists on a React Flow canvas and displays:
- Ticker
- Current price
- Market cap
- Performance columns: **1D**, **5D**, **2W**, **1M**, **3M**, **6M**, **1Y**, **5Y**

Ticker lists are persisted in Postgres (one row per list). The canvas
layout — node positions, edges, viewport — is kept in `localStorage`.

The app fetches live market data from Yahoo Finance through the `yfinance` library.

## Requirements

- Python 3.10+
- Node.js 22+
- Postgres 13+ (Railway-managed in production, local Docker for dev)
- Internet access for Yahoo Finance requests

## Install

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
cd frontend
npm install
```

## Database

The app reads `DATABASE_URL`. For local development, start the bundled Postgres via:

```bash
docker compose up -d postgres
export DATABASE_URL=postgresql://xscout:xscout@localhost:5432/xscout
```

Migrations run automatically the first time the app starts and are idempotent.
They are serialised across replicas with a Postgres advisory lock.

Existing browsers that have a canvas saved in `localStorage` are migrated
automatically on first load: each inline list is uploaded to the server,
then the local copy is reduced to layout-only.

## Run

Start the Flask API locally (with `DATABASE_URL` exported):

```bash
.venv/bin/python -m xscout
```

In another terminal, start the React frontend dev server:

```bash
cd frontend
npm run dev
```

Then open the Vite URL printed in the terminal, usually <http://localhost:5173>.
Keep the Flask API running at the same time; frontend API requests are proxied to Flask.

If this is your first frontend run, install the frontend dependencies first:

```bash
cd frontend
npm install
```

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

The default test suite mocks the database and runs without Postgres:

```bash
.venv/bin/python -m unittest discover -s tests
cd frontend
npm run build
```

To exercise the integration tests against a real Postgres, bring up the
local container and point the suite at it:

```bash
docker compose up -d postgres
TEST_DATABASE_URL=postgresql://xscout:xscout@localhost:5432/xscout \
  .venv/bin/python -m unittest discover -s tests
```
