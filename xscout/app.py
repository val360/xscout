from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import flask

from .formatting import (
    format_currency,
    format_market_cap,
    format_percent,
    performance_class,
    snapshot_to_row,
)
from .market_data import (
    StockSnapshot,
    build_watchlist,
    compute_performance,
    fetch_snapshot,
    parse_tickers,
    sort_snapshots,
)

FRONTEND_DIST = Path(__file__).parent / "static" / "app"

app = flask.Flask(__name__, static_folder=str(FRONTEND_DIST), static_url_path="")


@app.post("/api/watchlists/performance")
def watchlist_performance() -> flask.Response:
    payload = flask.request.get_json(silent=True) or {}
    tickers = _parse_ticker_payload(payload.get("tickers", ""))

    if not tickers:
        return flask.jsonify(
            {
                "rows": [],
                "errors": ["Enter at least one ticker to show performance."],
            }
        )

    snapshots, errors = build_watchlist(tickers)
    return flask.jsonify(
        {
            "rows": [snapshot_to_row(snapshot) for snapshot in snapshots],
            "errors": errors,
        }
    )


@app.get("/")
@app.get("/<path:path>")
def serve_frontend(path: str = "") -> flask.Response | str:
    if path.startswith("api/"):
        flask.abort(404)

    requested_file = FRONTEND_DIST / path
    if path and requested_file.is_file():
        return flask.send_from_directory(FRONTEND_DIST, path)

    index_file = FRONTEND_DIST / "index.html"
    if index_file.is_file():
        return flask.send_from_directory(FRONTEND_DIST, "index.html")

    return flask.Response(
        "xscout frontend is not built. Run npm run build in frontend/.",
        status=200,
        mimetype="text/plain",
    )


def _parse_ticker_payload(value: Any) -> list[str]:
    if isinstance(value, list):
        raw_tickers = " ".join(str(ticker) for ticker in value)
    elif isinstance(value, str):
        raw_tickers = value
    else:
        raw_tickers = ""
    return parse_tickers(raw_tickers)


def main() -> int:
    port = int(os.environ.get("PORT", "5000"))
    app.run(host="0.0.0.0", port=port)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
