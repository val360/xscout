# AGENTS.md

## Cursor Cloud specific instructions

**xscout** is a Python Flask stock watchlist application built on top of `yfinance`.
Ticker lists are persisted in Postgres (table `ticker_lists`). The React Flow
canvas layout (node positions, edges, viewport) is kept in `localStorage` in
the browser. The repository's `xscout/migrations/*.sql` files are applied on
startup, serialised by a Postgres advisory lock.

### Prerequisites
- **Python 3.10+**
- Use the project virtual environment for local commands.
- Create/refresh the virtual environment if needed:
  `python3 -m venv .venv && .venv/bin/python -m pip install -r requirements.txt`
- If the virtual environment already exists, use `.venv/bin/python` and `.venv/bin/pip` directly.

### Build & Run
- The canonical local run command is `.venv/bin/python -m xscout`
- Run with Gunicorn using `.venv/bin/gunicorn xscout.app:app`
- The application reads live Yahoo Finance data via `yfinance` and requires outbound internet access
- `DATABASE_URL` must point to a Postgres instance (e.g. `postgresql://xscout:xscout@localhost:5432/xscout`).
  Start the bundled local Postgres via `docker compose up -d postgres`. When `DATABASE_URL` is unset the ticker-list API returns 503; the rest of the app keeps working.

### Caveats
- Automated tests use `.venv/bin/python -m unittest discover -s tests` and run **without** a database by default; the route layer mocks the repository.
- Integration tests for `xscout/ticker_lists.py` are skipped unless `TEST_DATABASE_URL` is set; point it at the same docker-compose Postgres to enable them.
- There is no linter configured
- Network-dependent runs can fail or return partial data if Yahoo Finance throttles or changes upstream responses
