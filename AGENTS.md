# AGENTS.md

## Cursor Cloud specific instructions

**xscout** is a Python CLI stock watchlist application built on top of `yfinance`.
There is no web UI, no database, and no Docker infrastructure.

### Prerequisites
- **Python 3.10+** (Python 3.12 is available on the VM)
- Install dependencies with `python3 -m pip install -r requirements.txt`

### Build & Run
- The canonical run command is `python3 -m xscout`
- Pass CLI options directly, for example:
  `python3 -m xscout --tickers=AAPL,MSFT,NVDA --sort=marketcap --desc`
- The application reads live Yahoo Finance data via `yfinance` and requires outbound internet access

### Caveats
- Automated tests use `python3 -m unittest discover -s tests`
- There is no linter configured
- Network-dependent runs can fail or return partial data if Yahoo Finance throttles or changes upstream responses
