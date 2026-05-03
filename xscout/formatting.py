from __future__ import annotations

from .market_data import StockSnapshot


def snapshot_to_row(snapshot: StockSnapshot) -> dict[str, str]:
    return {
        "ticker": snapshot.ticker,
        "price": format_currency(snapshot.price),
        "marketCap": format_market_cap(snapshot.market_cap),
        "change1d": format_percent(snapshot.change_1d),
        "change1dClass": performance_class(snapshot.change_1d),
        "change5d": format_percent(snapshot.change_5d),
        "change5dClass": performance_class(snapshot.change_5d),
        "change2w": format_percent(snapshot.change_2w),
        "change2wClass": performance_class(snapshot.change_2w),
        "change1m": format_percent(snapshot.change_1m),
        "change1mClass": performance_class(snapshot.change_1m),
        "change3m": format_percent(snapshot.change_3m),
        "change3mClass": performance_class(snapshot.change_3m),
    }


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
