from __future__ import annotations

import argparse
import math
import sys
from dataclasses import dataclass
from typing import Callable, Sequence

import yfinance as yf

DEFAULT_TICKERS = ["AAPL", "MSFT", "GOOG", "AMZN", "NVDA", "TSLA"]
PERFORMANCE_WINDOWS = [
    ("1D", 1),
    ("5D", 5),
    ("2W", 10),
    ("1M", 21),
    ("3M", 63),
]
SORT_CHOICES = ("ticker", "price", "marketcap")


@dataclass(frozen=True)
class CliOptions:
    tickers: list[str]
    sort_by: str
    descending: bool


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


def parse_args(argv: Sequence[str]) -> CliOptions:
    parser = argparse.ArgumentParser(description="Stock Watchlist CLI")
    parser.add_argument(
        "--tickers",
        default=",".join(DEFAULT_TICKERS),
        help="Comma-separated ticker list",
    )
    parser.add_argument(
        "--sort",
        default="ticker",
        choices=SORT_CHOICES,
        help="Sort by ticker, price, or market cap",
    )
    parser.add_argument(
        "--desc",
        action="store_true",
        help="Sort descending",
    )
    args = parser.parse_args(list(argv))
    return CliOptions(
        tickers=parse_tickers(args.tickers),
        sort_by=args.sort,
        descending=args.desc,
    )


def parse_tickers(raw_tickers: str) -> list[str]:
    tickers = [ticker.strip().upper() for ticker in raw_tickers.split(",") if ticker.strip()]
    return tickers or list(DEFAULT_TICKERS)


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


def render_table(snapshots: Sequence[StockSnapshot]) -> str:
    headers = ["Ticker", "Price", "Market Cap", *[label for label, _ in PERFORMANCE_WINDOWS]]
    rows = [
        [
            snapshot.ticker,
            format_currency(snapshot.price),
            format_market_cap(snapshot.market_cap),
            format_percent(snapshot.change_1d),
            format_percent(snapshot.change_5d),
            format_percent(snapshot.change_2w),
            format_percent(snapshot.change_1m),
            format_percent(snapshot.change_3m),
        ]
        for snapshot in snapshots
    ]

    widths = []
    for index, header in enumerate(headers):
        max_row_width = max((len(row[index]) for row in rows), default=0)
        widths.append(max(len(header), max_row_width))

    lines = [_format_row(headers, widths), _format_separator(widths)]
    for row in rows:
        lines.append(_format_row(row, widths))
    return "\n".join(lines)


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


def main(argv: Sequence[str] | None = None) -> int:
    options = parse_args(argv if argv is not None else sys.argv[1:])

    snapshots: list[StockSnapshot] = []
    for ticker in options.tickers:
        try:
            snapshots.append(fetch_snapshot(ticker))
        except Exception as exc:  # pragma: no cover - network/library failures are integration behavior.
            print(f"Skipping {ticker}: {exc}")

    if not snapshots:
        print("No stock data could be fetched.")
        return 1

    sorted_snapshots = sort_snapshots(snapshots, options.sort_by, options.descending)
    print("Stock Watchlist")
    print(f"Sort: {options.sort_by}{' (desc)' if options.descending else ' (asc)'}")
    print()
    print(render_table(sorted_snapshots))
    return 0


def _coerce_number(value: object) -> float | None:
    if isinstance(value, (int, float)) and math.isfinite(value):
        return float(value)
    return None


def _format_row(values: Sequence[str], widths: Sequence[int]) -> str:
    cells = []
    for index, value in enumerate(values):
        if index == 0:
            cells.append(value.ljust(widths[index]))
        else:
            cells.append(value.rjust(widths[index]))
    return "  ".join(cells)


def _format_separator(widths: Sequence[int]) -> str:
    return "  ".join("-" * width for width in widths)


if __name__ == "__main__":
    raise SystemExit(main())
