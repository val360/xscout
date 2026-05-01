from __future__ import annotations

import argparse
import flask
import math
import os
import re
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
app = flask.Flask(__name__)

PAGE_TEMPLATE = """
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>xscout Stock Watchlist</title>
    <style>
        :root {
            color-scheme: light dark;
            font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        body {
            margin: 0;
            background: #f6f7fb;
            color: #172033;
        }

        main {
            max-width: 980px;
            margin: 0 auto;
            padding: 48px 20px;
        }

        .card {
            background: #ffffff;
            border: 1px solid #dfe3ec;
            border-radius: 18px;
            box-shadow: 0 14px 40px rgb(23 32 51 / 8%);
            padding: 28px;
        }

        h1 {
            margin: 0 0 8px;
            font-size: clamp(2rem, 5vw, 3.5rem);
            letter-spacing: -0.05em;
        }

        p {
            color: #5d687c;
            line-height: 1.55;
            margin: 0 0 24px;
        }

        form {
            display: flex;
            gap: 12px;
            margin-bottom: 28px;
        }

        input {
            flex: 1;
            min-width: 0;
            border: 1px solid #cbd2df;
            border-radius: 12px;
            font: inherit;
            padding: 14px 16px;
        }

        .saved-lists {
            border-top: 1px solid #e7eaf1;
            margin: 0 0 28px;
            padding-top: 24px;
        }

        .saved-lists h2 {
            font-size: 1rem;
            margin: 0 0 8px;
        }

        .saved-list-controls {
            display: grid;
            gap: 12px;
            grid-template-columns: minmax(0, 1fr) auto;
            margin-bottom: 16px;
        }

        .saved-list-items {
            display: grid;
            gap: 12px;
        }

        .saved-list-card {
            align-items: center;
            background: #f8faff;
            border: 1px solid #e0e6f2;
            border-radius: 14px;
            display: grid;
            gap: 12px;
            grid-template-columns: minmax(0, 1fr) auto;
            padding: 14px;
        }

        .saved-list-card h3 {
            font-size: 0.98rem;
            margin: 0 0 4px;
        }

        .saved-list-card p {
            font-size: 0.9rem;
            margin: 0;
            overflow-wrap: anywhere;
        }

        .saved-list-actions {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            justify-content: flex-end;
        }

        .saved-list-actions form {
            margin: 0;
        }

        button {
            border: 0;
            border-radius: 12px;
            background: #2454ff;
            color: #ffffff;
            cursor: pointer;
            font: inherit;
            font-weight: 700;
            padding: 14px 20px;
        }

        .secondary-button {
            background: #e8ecf7;
            color: #172033;
        }

        .danger-button {
            background: #fff1f1;
            color: #8d1f1f;
        }

        .table-wrap {
            overflow-x: auto;
        }

        table {
            border-collapse: collapse;
            width: 100%;
        }

        th,
        td {
            border-bottom: 1px solid #e7eaf1;
            padding: 13px 10px;
            text-align: right;
            white-space: nowrap;
        }

        th:first-child,
        td:first-child {
            text-align: left;
        }

        th {
            color: #5d687c;
            font-size: 0.78rem;
            letter-spacing: 0.08em;
            text-transform: uppercase;
        }

        .empty,
        .errors {
            border-radius: 12px;
            padding: 14px 16px;
        }

        .empty {
            background: #f0f3f8;
            color: #5d687c;
        }

        .errors {
            background: #fff1f1;
            color: #8d1f1f;
            margin-bottom: 20px;
        }

        .positive {
            color: #0b7a3b;
            font-weight: 700;
        }

        .negative {
            color: #ba2d2d;
            font-weight: 700;
        }

        @media (prefers-color-scheme: dark) {
            body {
                background: #0f1420;
                color: #eef2f8;
            }

            .card {
                background: #151b2a;
                border-color: #2b3548;
            }

            p,
            th,
            .empty {
                color: #aab4c5;
            }

            input {
                background: #0f1420;
                border-color: #38445a;
                color: #eef2f8;
            }

            .saved-lists {
                border-top-color: #2b3548;
            }

            .saved-list-card {
                background: #101827;
                border-color: #2b3548;
            }

            .secondary-button {
                background: #273248;
                color: #eef2f8;
            }

            th,
            td {
                border-bottom-color: #2b3548;
            }

            .empty {
                background: #1d2637;
            }
        }

        @media (max-width: 640px) {
            form,
            .saved-list-controls,
            .saved-list-card {
                grid-template-columns: 1fr;
            }

            form {
                flex-direction: column;
            }

            .saved-list-actions {
                justify-content: stretch;
            }

            .saved-list-actions button,
            .saved-list-controls button {
                width: 100%;
            }
        }
    </style>
</head>
<body>
    <main>
        <section class="card">
            <h1>xscout</h1>
            <p>Enter comma- or space-separated stock tickers to view current price, market cap, and recent performance.</p>

            <form id="ticker-form" method="post">
                <input
                    id="ticker-input"
                    name="tickers"
                    type="text"
                    value="{{ ticker_input }}"
                    placeholder="AAPL, MSFT, NVDA"
                    aria-label="Ticker symbols"
                    autofocus
                >
                <button type="submit">Show Performance</button>
            </form>

            <section class="saved-lists" aria-labelledby="saved-lists-heading">
                <h2 id="saved-lists-heading">Saved ticker lists</h2>
                <p>Save the current tickers in this browser, then run performance for any saved list.</p>
                <div class="saved-list-controls">
                    <input
                        id="saved-list-name"
                        type="text"
                        placeholder="List name, e.g. AI leaders"
                        aria-label="Saved list name"
                    >
                    <button id="save-list-button" type="button">Save Current List</button>
                </div>
                <div id="saved-list-message" class="empty" role="status"></div>
                <div id="saved-list-items" class="saved-list-items" aria-live="polite"></div>
            </section>

            {% if errors %}
                <div class="errors">
                    {% for error in errors %}
                        <div>{{ error }}</div>
                    {% endfor %}
                </div>
            {% endif %}

            {% if rows %}
                <div class="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Ticker</th>
                                <th>Price</th>
                                <th>Market Cap</th>
                                <th>1D</th>
                                <th>5D</th>
                                <th>2W</th>
                                <th>1M</th>
                                <th>3M</th>
                            </tr>
                        </thead>
                        <tbody>
                            {% for row in rows %}
                                <tr>
                                    <td><strong>{{ row.ticker }}</strong></td>
                                    <td>{{ row.price }}</td>
                                    <td>{{ row.market_cap }}</td>
                                    <td class="{{ row.change_1d_class }}">{{ row.change_1d }}</td>
                                    <td class="{{ row.change_5d_class }}">{{ row.change_5d }}</td>
                                    <td class="{{ row.change_2w_class }}">{{ row.change_2w }}</td>
                                    <td class="{{ row.change_1m_class }}">{{ row.change_1m }}</td>
                                    <td class="{{ row.change_3m_class }}">{{ row.change_3m }}</td>
                                </tr>
                            {% endfor %}
                        </tbody>
                    </table>
                </div>
            {% else %}
                <div class="empty">No stock data to display yet.</div>
            {% endif %}
        </section>
    </main>
    <script>
        (function () {
            var STORAGE_KEY = "xscout.savedTickerLists";
            var tickerInput = document.getElementById("ticker-input");
            var nameInput = document.getElementById("saved-list-name");
            var saveButton = document.getElementById("save-list-button");
            var message = document.getElementById("saved-list-message");
            var listItems = document.getElementById("saved-list-items");

            function readSavedLists() {
                try {
                    var parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
                    if (!Array.isArray(parsed)) {
                        return [];
                    }
                    return parsed.filter(function (item) {
                        return item && typeof item.name === "string" && typeof item.tickers === "string";
                    });
                } catch (error) {
                    return [];
                }
            }

            function writeSavedLists(savedLists) {
                window.localStorage.setItem(STORAGE_KEY, JSON.stringify(savedLists));
            }

            function normalizeName(name) {
                return name.trim().replace(/\s+/g, " ");
            }

            function setMessage(text) {
                message.textContent = text;
            }

            function renderSavedLists() {
                var savedLists = readSavedLists();
                listItems.innerHTML = "";

                if (savedLists.length === 0) {
                    setMessage("No saved lists yet.");
                    return;
                }

                setMessage(savedLists.length + " saved " + (savedLists.length === 1 ? "list." : "lists."));
                savedLists.forEach(function (savedList, index) {
                    var card = document.createElement("article");
                    card.className = "saved-list-card";

                    var details = document.createElement("div");
                    var title = document.createElement("h3");
                    title.textContent = savedList.name;
                    var tickers = document.createElement("p");
                    tickers.textContent = savedList.tickers;
                    details.appendChild(title);
                    details.appendChild(tickers);

                    var actions = document.createElement("div");
                    actions.className = "saved-list-actions";

                    var performanceForm = document.createElement("form");
                    performanceForm.method = "post";
                    var hiddenTickers = document.createElement("input");
                    hiddenTickers.type = "hidden";
                    hiddenTickers.name = "tickers";
                    hiddenTickers.value = savedList.tickers;
                    var performanceButton = document.createElement("button");
                    performanceButton.type = "submit";
                    performanceButton.textContent = "Get Performance";
                    performanceForm.appendChild(hiddenTickers);
                    performanceForm.appendChild(performanceButton);

                    var loadButton = document.createElement("button");
                    loadButton.type = "button";
                    loadButton.className = "secondary-button";
                    loadButton.textContent = "Load";
                    loadButton.addEventListener("click", function () {
                        tickerInput.value = savedList.tickers;
                        nameInput.value = savedList.name;
                        setMessage("Loaded " + savedList.name + ".");
                    });

                    var deleteButton = document.createElement("button");
                    deleteButton.type = "button";
                    deleteButton.className = "danger-button";
                    deleteButton.textContent = "Delete";
                    deleteButton.addEventListener("click", function () {
                        var nextLists = readSavedLists();
                        nextLists.splice(index, 1);
                        writeSavedLists(nextLists);
                        renderSavedLists();
                    });

                    actions.appendChild(performanceForm);
                    actions.appendChild(loadButton);
                    actions.appendChild(deleteButton);
                    card.appendChild(details);
                    card.appendChild(actions);
                    listItems.appendChild(card);
                });
            }

            saveButton.addEventListener("click", function () {
                var name = normalizeName(nameInput.value);
                var tickers = tickerInput.value.trim();

                if (!name) {
                    setMessage("Enter a name before saving this list.");
                    nameInput.focus();
                    return;
                }

                if (!tickers) {
                    setMessage("Enter at least one ticker before saving this list.");
                    tickerInput.focus();
                    return;
                }

                var savedLists = readSavedLists();
                var existingIndex = savedLists.findIndex(function (savedList) {
                    return savedList.name.toLowerCase() === name.toLowerCase();
                });
                var savedList = { name: name, tickers: tickers };

                if (existingIndex >= 0) {
                    savedLists[existingIndex] = savedList;
                    setMessage("Updated " + name + ".");
                } else {
                    savedLists.push(savedList);
                    setMessage("Saved " + name + ".");
                }

                writeSavedLists(savedLists);
                renderSavedLists();
            });

            renderSavedLists();
        }());
    </script>
</body>
</html>
"""


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
    tickers = [
        ticker.strip().upper()
        for ticker in re.split(r"[\s,]+", raw_tickers)
        if ticker.strip()
    ]
    return tickers or list(DEFAULT_TICKERS)


@app.route("/", methods=["GET", "POST"])
def index() -> str:
    ticker_input = flask.request.form.get("tickers", ",".join(DEFAULT_TICKERS))
    snapshots: list[StockSnapshot] = []
    errors: list[str] = []

    if flask.request.method == "POST":
        snapshots, errors = build_watchlist(parse_tickers(ticker_input))

    return flask.render_template_string(
        PAGE_TEMPLATE,
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


def performance_class(value: float | None) -> str:
    if value is None or value == 0:
        return ""
    if value > 0:
        return "positive"
    return "negative"


def main(argv: Sequence[str] | None = None) -> int:
    del argv
    port = int(os.environ.get("PORT", "5000"))
    app.run(host="0.0.0.0", port=port)
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
