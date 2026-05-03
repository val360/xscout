# AGENTS.md

## Cursor Cloud specific instructions

**xscout** is a Python Flask stock watchlist application built on top of `yfinance`.
It has no database. Saved ticker lists are stored in the browser via `localStorage`.

### Prerequisites
- **Python 3.10+** (with `venv`: e.g. Ubuntu `python3.12-venv`)
- **Node.js 22+** for the React frontend (see `frontend/package.json` `engines` and repo `.nvmrc`)
- Use the project virtual environment for local commands.
- Create/refresh the virtual environment if needed:
  `python3 -m venv .venv && .venv/bin/python -m pip install -r requirements.txt`
- If the virtual environment already exists, use `.venv/bin/python` and `.venv/bin/pip` directly.

### Build & Run
- The canonical local run command is `.venv/bin/python -m xscout`
- Run with Gunicorn using `.venv/bin/gunicorn xscout.app:app`
- The application reads live Yahoo Finance data via `yfinance` and requires outbound internet access

### Validate (tests + production frontend build)
- After `npm install` or `npm ci` in `frontend/`, run `./scripts/validate.sh` from the repo root (requires `.venv` and Node 22+).

### Caveats
- Automated tests use `.venv/bin/python -m unittest discover -s tests`
- A full local check also runs `npm run build` in `frontend/` (outputs to `xscout/static/app/`, gitignored)
- There is no linter configured
- Network-dependent runs can fail or return partial data if Yahoo Finance throttles or changes upstream responses
