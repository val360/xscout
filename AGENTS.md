# AGENTS.md

## Cursor Cloud specific instructions

**xscout** is a Flask + React stock watchlist application built on top of `yfinance`.
It has no database. Saved ticker lists are stored in the browser via `localStorage`.
The React frontend lives in `frontend/` and is built into `xscout/static/app/`, where Flask serves it.

### Prerequisites
- **Python 3.10+** (Ubuntu 24.04 ships with 3.12; install `python3.12-venv` via apt if `python3 -m venv` fails)
- **Node.js 22+** and **npm** (install via NodeSource: `curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs`)
- Use the project virtual environment for local Python commands.
- Create/refresh the virtual environment if needed:
 `python3 -m venv .venv && .venv/bin/python -m pip install -r requirements.txt`
- If the virtual environment already exists, use `.venv/bin/python` and `.venv/bin/pip` directly.
- Install frontend dependencies once with `cd frontend && npm install`.

### Build & Run
- Build the React bundle into Flask static assets: `cd frontend && npm run build`. This populates `xscout/static/app/`, which Flask serves at `/`.
- The canonical local run command is `.venv/bin/python -m xscout` (Flask dev server on port 5000).
- Run with Gunicorn using `.venv/bin/gunicorn --bind 0.0.0.0:5000 xscout.app:app`.
- For interactive frontend development, run the Vite dev server: `cd frontend && npm run dev` (it proxies `/api/*` to the Flask backend).
- The application reads live Yahoo Finance data via `yfinance` and requires outbound internet access.

### Caveats
- Automated backend tests use `.venv/bin/python -m unittest discover -s tests`.
- The frontend has no separate test command; `cd frontend && npm run build` (which runs `tsc -b && vite build`) acts as the type-check and build verification step.
- There is no linter configured.
- Network-dependent runs can fail or return partial data if Yahoo Finance throttles or changes upstream responses.
- If `xscout/static/app/` is missing, the root URL returns a plain-text "frontend is not built" message instead of the React UI; rebuild the frontend to fix.
