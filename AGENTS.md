# AGENTS.md

## Cursor Cloud specific instructions

**xscout** is a Python Flask stock watchlist application built on top of `yfinance`.
It has no database. Saved ticker lists are stored in the browser via `localStorage`.

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

### Caveats
- Automated tests use `.venv/bin/python -m unittest discover -s tests`
- There is no linter configured
- Network-dependent runs can fail or return partial data if Yahoo Finance throttles or changes upstream responses
