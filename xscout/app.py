from __future__ import annotations

import flask
import math
import os
import re
from dataclasses import dataclass
from typing import Callable, Sequence

import yfinance as yf

PERFORMANCE_WINDOWS = [
    ("1D", 1),
    ("5D", 5),
    ("2W", 10),
    ("1M", 21),
    ("3M", 63),
]
app = flask.Flask(__name__)


@dataclass(frozen=True)
class StockSnapshot:
    ticker: str
    price: float | None
    market_cap: float | None
    change_1d: float | None
    change_5d: float | None
    change_2w: float | None
    change_1m: float | None
    change_3m: float | None


def parse_tickers(raw_tickers: str) -> list[str]:
    return [
        ticker.strip().upper()
        for ticker in re.split(r"[\s,]+", raw_tickers)
        if ticker.strip()
    ]


@app.route("/", methods=["GET", "POST"])
def index() -> str:
    ticker_input = flask.request.form.get("tickers", "")
    snapshots: list[StockSnapshot] = []
    errors: list[str] = []

    if flask.request.method == "POST":
        tickers = parse_tickers(ticker_input)
        if tickers:
            snapshots, errors = build_watchlist(tickers)
        else:
            errors.append("Enter at least one ticker to show performance.")

    return flask.render_template(
        "index.html",
        ticker_input=ticker_input,
        rows=[snapshot_to_row(snapshot) for snapshot in snapshots],
        errors=errors,
    )


def build_watchlist(tickers: Sequence[str]) -> tuple[list[StockSnapshot], list[str]]:
    snapshots: list[StockSnapshot] = []
    errors: list[str] = []
    for ticker in tickers:
        try:
            snapshots.append(fetch_snapshot(ticker))
        except Exception as exc:  # pragma: no cover - network/library failures are integration behavior.
            errors.append(f"Skipping {ticker}: {exc}")

    return sort_snapshots(snapshots, "ticker", descending=False), errors


def snapshot_to_row(snapshot: StockSnapshot) -> dict[str, str]:
    return {
        "ticker": snapshot.ticker,
        "price": format_currency(snapshot.price),
        "market_cap": format_market_cap(snapshot.market_cap),
        "change_1d": format_percent(snapshot.change_1d),
        "change_1d_class": performance_class(snapshot.change_1d),
        "change_5d": format_percent(snapshot.change_5d),
        "change_5d_class": performance_class(snapshot.change_5d),
        "change_2w": format_percent(snapshot.change_2w),
        "change_2w_class": performance_class(snapshot.change_2w),
        "change_1m": format_percent(snapshot.change_1m),
        "change_1m_class": performance_class(snapshot.change_1m),
        "change_3m": format_percent(snapshot.change_3m),
        "change_3m_class": performance_class(snapshot.change_3m),
    }


def fetch_snapshot(ticker: str) -> StockSnapshot:
    stock = yf.Ticker(ticker)
    fast_info = stock.fast_info
    history = stock.history(period="6mo", interval="1d", auto_adjust=False)

    closes = []
    if "Close" in history:
        closes = [float(value) for value in history["Close"].dropna().tolist()]

    price = _coerce_number(fast_info.get("lastPrice"))
    if price is None and closes:
        price = closes[-1]

    market_cap = _coerce_number(fast_info.get("marketCap"))
    if price is None or market_cap is None:
        info = stock.info
        if price is None:
            price = _coerce_number(info.get("currentPrice"))
            if price is None:
                price = _coerce_number(info.get("regularMarketPrice"))
        if market_cap is None:
            market_cap = _coerce_number(info.get("marketCap"))

    if price is None and market_cap is None and not closes:
        raise ValueError(f"No quote data returned by yfinance for {ticker}.")

    performance_by_window = {
        trading_days_back: compute_performance(closes, trading_days_back)
        for _, trading_days_back in PERFORMANCE_WINDOWS
    }

    return StockSnapshot(
        ticker=ticker.upper(),
        price=price,
        market_cap=market_cap,
        change_1d=performance_by_window[1],
        change_5d=performance_by_window[5],
        change_2w=performance_by_window[10],
        change_1m=performance_by_window[21],
        change_3m=performance_by_window[63],
    )


def compute_performance(closes: Sequence[float], trading_days_back: int) -> float | None:
    if len(closes) < 2:
        return None

    current_index = len(closes) - 1
    start_index = current_index - trading_days_back
    if start_index < 0:
        return None

    start = closes[start_index]
    end = closes[current_index]
    if start == 0:
        return None

    return ((end - start) / start) * 100.0


def sort_snapshots(
    snapshots: Sequence[StockSnapshot],
    sort_by: str,
    descending: bool,
) -> list[StockSnapshot]:
    if sort_by == "ticker":
        return sorted(snapshots, key=lambda snapshot: snapshot.ticker, reverse=descending)

    getter_map: dict[str, Callable[[StockSnapshot], float | None]] = {
        "price": lambda snapshot: snapshot.price,
        "marketcap": lambda snapshot: snapshot.market_cap,
    }
    getter = getter_map[sort_by]

    sortable = [snapshot for snapshot in snapshots if getter(snapshot) is not None]
    missing = [snapshot for snapshot in snapshots if getter(snapshot) is None]
    sortable.sort(key=lambda snapshot: getter(snapshot) or 0.0, reverse=descending)
    return sortable + missing


def format_currency(value: float | None) -> str:
    if value is None:
        return "N/A"
    return f"${value:,.2f}"


def format_market_cap(value: float | None) -> str:
    if value is None or value <= 0:
        return "N/A"
    if value >= 1_000_000_000_000:
        return f"${value / 1_000_000_000_000:.2f}T"
    if value >= 1_000_000_000:
        return f"${value / 1_000_000_000:.2f}B"
    if value >= 1_000_000:
        return f"${value / 1_000_000:.2f}M"
    return f"${value:,.0f}"


def format_percent(value: float | None) -> str:
    if value is None:
        return "N/A"
    return f"{value:+.2f}%"


def performance_class(value: float | None) -> str:
    if value is None or value == 0:
        return ""
    if value > 0:
        return "positive"
    return "negative"


def main() -> int:
    port = int(os.environ.get("PORT", "5000"))
    app.run(host="0.0.0.0", port=port)
    return 0


def _coerce_number(value: object) -> float | None:
    if isinstance(value, (int, float)) and math.isfinite(value):
        return float(value)
    return None


if __name__ == "__main__":
    raise SystemExit(main())
