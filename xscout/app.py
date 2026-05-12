from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any

import flask

from . import db, ticker_lists
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

LOGGER = logging.getLogger(__name__)

FRONTEND_DIST = Path(__file__).parent / "static" / "app"

app = flask.Flask(__name__, static_folder=str(FRONTEND_DIST), static_url_path="")


# Run migrations once at module load, when configured. Skipping in tests
# (DATABASE_URL unset) keeps the existing unit-test workflow zero-touch.
# Gunicorn loads this module once in the master process; the advisory lock
# inside run_migrations() serialises any concurrent attempts from sibling
# replicas during a deploy.
if db.is_configured() and os.environ.get("XSCOUT_SKIP_MIGRATIONS") != "1":
    try:
        db.init_db()
    except Exception:  # pragma: no cover - logged for operator visibility
        LOGGER.exception("Database migrations failed at startup")
        raise


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


@app.get("/api/ticker-lists")
def list_ticker_lists() -> flask.Response:
    if not db.is_configured():
        return _database_unavailable_response()
    try:
        lists = ticker_lists.list_all()
    except Exception:
        LOGGER.exception("Failed to list ticker lists")
        return flask.jsonify({"error": "Failed to load ticker lists."}), 500
    return flask.jsonify({"lists": [item.to_api() for item in lists]})


@app.post("/api/ticker-lists")
def create_ticker_list() -> flask.Response:
    if not db.is_configured():
        return _database_unavailable_response()
    payload = flask.request.get_json(silent=True) or {}
    try:
        created = ticker_lists.create(
            name=payload.get("name"),
            tickers=payload.get("tickers", []),
        )
    except ticker_lists.TickerListValidationError as exc:
        return flask.jsonify({"error": str(exc)}), 400
    except Exception:
        LOGGER.exception("Failed to create ticker list")
        return flask.jsonify({"error": "Failed to create ticker list."}), 500
    return flask.jsonify(created.to_api()), 201


@app.patch("/api/ticker-lists/<list_id>")
def update_ticker_list(list_id: str) -> flask.Response:
    if not db.is_configured():
        return _database_unavailable_response()
    payload = flask.request.get_json(silent=True) or {}
    if not isinstance(payload, dict):
        return flask.jsonify({"error": "Request body must be a JSON object."}), 400
    try:
        updated = ticker_lists.update(
            list_id,
            name=payload.get("name") if "name" in payload else None,
            tickers=payload.get("tickers") if "tickers" in payload else None,
        )
    except ticker_lists.TickerListValidationError as exc:
        return flask.jsonify({"error": str(exc)}), 400
    except ticker_lists.TickerListNotFoundError:
        return flask.jsonify({"error": "Ticker list not found."}), 404
    except Exception:
        LOGGER.exception("Failed to update ticker list %s", list_id)
        return flask.jsonify({"error": "Failed to update ticker list."}), 500
    return flask.jsonify(updated.to_api())


@app.delete("/api/ticker-lists/<list_id>")
def delete_ticker_list(list_id: str) -> flask.Response:
    if not db.is_configured():
        return _database_unavailable_response()
    try:
        ticker_lists.delete(list_id)
    except ticker_lists.TickerListValidationError as exc:
        return flask.jsonify({"error": str(exc)}), 400
    except ticker_lists.TickerListNotFoundError:
        return flask.jsonify({"error": "Ticker list not found."}), 404
    except Exception:
        LOGGER.exception("Failed to delete ticker list %s", list_id)
        return flask.jsonify({"error": "Failed to delete ticker list."}), 500
    return flask.Response(status=204)


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


def _database_unavailable_response() -> flask.Response:
    response = flask.jsonify(
        {
            "error": "Server storage is not configured. Set DATABASE_URL to a Postgres instance."
        }
    )
    response.status_code = 503
    return response


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
