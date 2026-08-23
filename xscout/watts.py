"""Watts Into Thoughts dashboard: intelligence per unit of energy.

Tracks the "what to watch" items from Michael Nicoletos's August 2026 note
(drawing on Raoul Pal / Global Macro Investor and Ribbit Capital's Power
Letter) using live Yahoo Finance proxies plus dated research snapshots for
physical constraints that are not listed securities.
"""

from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Callable, Sequence

import yfinance as yf

from .formatting import format_currency, format_percent, performance_class
from .market_data import compute_performance

LOGGER = logging.getLogger(__name__)

CACHE_TTL_SECONDS = 300
DASHBOARD_WINDOWS: tuple[tuple[str, int], ...] = (
    ("1D", 1),
    ("1M", 21),
    ("3M", 63),
    ("6M", 126),
    ("1Y", 252),
)
SPARKLINE_POINTS = 60

FetchHistories = Callable[[Sequence[str]], tuple[dict[str, list[float]], list[str]]]


@dataclass(frozen=True)
class Instrument:
    ticker: str
    name: str
    role: str
    kind: str = "price"  # "price" or "yield"


@dataclass(frozen=True)
class ResearchMetric:
    id: str
    label: str
    value: str
    detail: str
    as_of: str
    source: str


@dataclass(frozen=True)
class PanelSpec:
    id: str
    title: str
    watch: str
    instruments: tuple[Instrument, ...]
    metrics: tuple[ResearchMetric, ...] = ()


@dataclass(frozen=True)
class SpreadSpec:
    id: str
    label: str
    description: str
    long_tickers: tuple[str, ...]
    short_tickers: tuple[str, ...]


# ---------------------------------------------------------------------------
# Catalog
# ---------------------------------------------------------------------------

OIL = Instrument("CL=F", "WTI crude", "Still the old world benchmark")
BRENT = Instrument("BZ=F", "Brent crude", "International oil benchmark")
GAS = Instrument("NG=F", "Henry Hub gas", "Fuel for much of US thermal power")
XLE = Instrument("XLE", "Energy Select", "Oil & gas producers")
XLU = Instrument("XLU", "Utilities Select", "Regulated electricity complex")
URA = Instrument("URA", "Uranium miners", "Fuel for firm, low-carbon power")
VST = Instrument("VST", "Vistra", "Texas independent power / ERCOT")
CEG = Instrument("CEG", "Constellation", "Largest US nuclear generator")
NEE = Instrument("NEE", "NextEra Energy", "US renewables + regulated utility")
NRG = Instrument("NRG", "NRG Energy", "Competitive power, Texas & East")

GEV = Instrument("GEV", "GE Vernova", "Grid equipment, turbines, transformers")
POWL = Instrument("POWL", "Powell Industries", "Electrical switchgear & substations")
HUBB = Instrument("HUBB", "Hubbell", "Electrical infrastructure hardware")
EMR = Instrument("EMR", "Emerson", "Automation and grid-adjacent systems")
ETN = Instrument("ETN", "Eaton", "Power management and electrical gear")
VRT = Instrument("VRT", "Vertiv", "Data-center cooling and power")

TNX = Instrument("^TNX", "US 10-year yield", "Risk-free rate that sets financing cost", kind="yield")
HYG = Instrument("HYG", "High-yield credit", "Junk bond proxy; risk appetite")
LQD = Instrument("LQD", "IG corporate credit", "Investment-grade financing conditions")
TLT = Instrument("TLT", "Long Treasuries", "Duration; inverse to long rates")
KKR = Instrument("KKR", "KKR", "Nvidia AI infrastructure financing partner")
BX = Instrument("BX", "Blackstone", "Nvidia AI infrastructure financing partner")
APO = Instrument("APO", "Apollo", "Nvidia AI infrastructure financing partner")
BLK = Instrument("BLK", "BlackRock", "Nvidia AI infrastructure financing partner")

IBE = Instrument("IBE.MC", "Iberdrola", "Iberian renewables + networks")
ENGI = Instrument("ENGI.PA", "Engie", "European generation and infrastructure")
EQNR = Instrument("EQNR", "Equinor", "Nordic energy, hydro-adjacent Norway")
FORTUM = Instrument("FORTUM.HE", "Fortum", "Nordic hydro and nuclear")

EQIX = Instrument("EQIX", "Equinix", "Global interconnection data centers")
DLR = Instrument("DLR", "Digital Realty", "Wholesale / hyperscale data centers")
MSFT = Instrument("MSFT", "Microsoft", "Hyperscale cloud / OpenAI host")
GOOGL = Instrument("GOOGL", "Alphabet", "Hyperscale cloud + Gemini tokens")
AMZN = Instrument("AMZN", "Amazon", "AWS hyperscale")
ORCL = Instrument("ORCL", "Oracle", "Cloud backlog / AI training clusters")
META = Instrument("META", "Meta", "Training clusters and open models")

NVDA = Instrument("NVDA", "NVIDIA", "Work per watt at the chip layer")
AVGO = Instrument("AVGO", "Broadcom", "Custom accelerators and networking")
TSM = Instrument("TSM", "TSMC", "Leading-edge silicon capacity")
AMD = Instrument("AMD", "AMD", "Alternative accelerators")

INSTRUMENTS: dict[str, Instrument] = {
    inst.ticker: inst
    for inst in (
        OIL,
        BRENT,
        GAS,
        XLE,
        XLU,
        URA,
        VST,
        CEG,
        NEE,
        NRG,
        GEV,
        POWL,
        HUBB,
        EMR,
        ETN,
        VRT,
        TNX,
        HYG,
        LQD,
        TLT,
        KKR,
        BX,
        APO,
        BLK,
        IBE,
        ENGI,
        EQNR,
        FORTUM,
        EQIX,
        DLR,
        MSFT,
        GOOGL,
        AMZN,
        ORCL,
        META,
        NVDA,
        AVGO,
        TSM,
        AMD,
    )
}

PANELS: tuple[PanelSpec, ...] = (
    PanelSpec(
        id="electricity-prices",
        title="Electricity prices",
        watch="Focus more on electricity prices than on oil alone.",
        instruments=(OIL, BRENT, GAS, XLE, XLU, URA, VST, CEG, NEE),
        metrics=(
            ResearchMetric(
                id="europe-power-premium",
                label="Europe vs US power",
                value="2–3×",
                detail="European industrial electricity prices run two to three times US levels; gas four to five times. Every unit of intelligence produced on expensive power costs more to run.",
                as_of="2024–2025",
                source="Draghi report on competitiveness",
            ),
            ResearchMetric(
                id="negative-price-hours",
                label="Negative wholesale hours",
                value="573 / 500+",
                detail="Germany recorded 573 hours of negative wholesale electricity prices in 2025; Spain passed 500. Surplus power is real — connecting it to compute is the constraint.",
                as_of="2025",
                source="Bloomberg (Jan 2026)",
            ),
        ),
    ),
    PanelSpec(
        id="grid-queues",
        title="Grid connection queues",
        watch="Watch grid connection queues — the backlog of projects waiting to join the wire.",
        instruments=(GEV, NEE, VST, CEG, ETN),
        metrics=(
            ResearchMetric(
                id="us-queue-tw",
                label="US interconnection queue",
                value="2.06 TW",
                detail="Peaked near 2.6 TW in 2023. Still about 50% more than all generating capacity America has ever built. Most queued projects will never be completed.",
                as_of="End of 2025",
                source="Lawrence Berkeley National Laboratory, Queued Up 2026",
            ),
            ResearchMetric(
                id="median-wait",
                label="Median wait, completed projects",
                value=">5 years",
                detail="Projects finished in 2025 waited a median of more than five years from application to operation. Money can still slow the cycle; delivery of permits and interconnects is tighter.",
                as_of="2025",
                source="Lawrence Berkeley National Laboratory",
            ),
            ResearchMetric(
                id="dc-power-demand",
                label="Data-center power demand",
                value="+175%",
                detail="Goldman Sachs expects global data-center power demand to rise about 175% by 2030 from 2023 levels.",
                as_of="2025 research",
                source="Goldman Sachs Research",
            ),
        ),
    ),
    PanelSpec(
        id="transformer-lead-times",
        title="Transformer lead times",
        watch="Watch transformer lead times — the hardware that has to exist before a watt becomes a thought.",
        instruments=(GEV, POWL, HUBB, EMR, ETN, VRT),
        metrics=(
            ResearchMetric(
                id="musk-sequence",
                label="Constraint sequence",
                value="Chips → iron → watts",
                detail="Elon Musk warned the constraint would move from chips to transformers to electricity itself, joking the industry was running out of transformers to run transformers. Once that shortage is solved, the fundamental shortage is power generation.",
                as_of="2024–2025",
                source="CNBC / public remarks",
            ),
            ResearchMetric(
                id="amodei-gw",
                label="US AI electric capacity",
                value="≥50 GW by 2028",
                detail="Anthropic's Dario Amodei has told Washington the American AI sector alone will need at least 50 gigawatts by 2028 — roughly twice New York City's peak demand.",
                as_of="2025",
                source="Anthropic, Build AI in America",
            ),
        ),
    ),
    PanelSpec(
        id="financing-conditions",
        title="Financing conditions",
        watch="Watch financing conditions — the buildout no longer depends on tech cash flows alone.",
        instruments=(TNX, HYG, LQD, TLT, KKR, BX, APO, BLK),
        metrics=(
            ResearchMetric(
                id="nvidia-credit",
                label="AI infrastructure credit",
                value=">$500B",
                detail="In August 2026 Nvidia announced financing platforms with Apollo, BlackRock, Blackstone, Brookfield, Goldman Sachs and KKR, treating chips and data centers as long-lived assets that can be borrowed against. Skeptics note chips age quickly and some financing is circular.",
                as_of="August 2026",
                source="Nvidia / Guardian / CNBC",
            ),
            ResearchMetric(
                id="cloud-backlog",
                label="Signed cloud backlog",
                value="$1.8T+",
                detail="Microsoft, Google and Oracle alone reported more than $1.8 trillion of signed cloud contracts still waiting to be delivered by mid-2026.",
                as_of="Mid-2026",
                source="Company filings / Nicoletos compilation",
            ),
        ),
    ),
    PanelSpec(
        id="surplus-power",
        title="Regions with reliable surplus power",
        watch="Watch regions with reliable surplus power — cost and speed of operating there will decide who scales.",
        instruments=(VST, CEG, NRG, IBE, ENGI, EQNR, FORTUM, NEE),
        metrics=(
            ResearchMetric(
                id="france-nuclear",
                label="France nuclear fleet",
                value="57 reactors",
                detail="About two-thirds of French electricity, the highest nuclear share in the world: a large base of cheap, low-carbon firm power.",
                as_of="IAEA PRIS",
                source="IAEA PRIS / Nicoletos",
            ),
            ResearchMetric(
                id="us-vs-europe-twh",
                label="Data-center demand to 2030",
                value="+240 vs +45 TWh",
                detail="IEA expects data-center electricity demand to grow by about 240 TWh in the United States by 2030, compared with about 45 TWh in Europe. The US already used ~45% of global data-center electricity in 2024 vs ~15% for Europe and ~25% for China.",
                as_of="2024–2026",
                source="International Energy Agency",
            ),
        ),
    ),
    PanelSpec(
        id="data-center-jurisdictions",
        title="Where data centers get built",
        watch="Data centers will be built across many jurisdictions, because speed, resilience, security, regulation and customer preference all favor regional capacity.",
        instruments=(EQIX, DLR, VRT, MSFT, GOOGL, AMZN, ORCL, META),
        metrics=(
            ResearchMetric(
                id="capex-race",
                label="Hyperscale capex",
                value="$400B → +75%",
                detail="IEA: capital spending by the largest technology companies passed $400 billion in 2025 and is expected to rise about 75% in 2026. Five tech companies now outspend global oil and gas production investment. McKinsey: $6.7T of data-center investment by 2030, $5.2T of it for AI.",
                as_of="2025–2026",
                source="IEA; McKinsey, The cost of compute",
            ),
            ResearchMetric(
                id="investai",
                label="Europe InvestAI",
                value="€200B / €20B",
                detail="InvestAI aims to mobilize €200 billion for European AI, including €20 billion for a first wave of four to five AI gigafactories. The Commission estimates about €584 billion of electricity grid investment is needed by 2030 — a requirement, not a funded budget.",
                as_of="2025–2026",
                source="European Commission",
            ),
        ),
    ),
    PanelSpec(
        id="intelligence-per-watt",
        title="Useful intelligence per unit of energy",
        watch="Above all, watch how much useful intelligence the world extracts from each unit of energy.",
        instruments=(NVDA, AVGO, TSM, AMD, MSFT, GOOGL, XLU, VST),
        metrics=(
            ResearchMetric(
                id="energy-per-task",
                label="Energy per AI task",
                value="~10× cheaper / year",
                detail="The IEA describes the recent fall in energy used per AI task as unprecedented in energy history, with energy needed per task dropping around tenfold each year. Pal's thesis: every system evolves toward maximum intelligence per unit of energy.",
                as_of="2025–2026",
                source="IEA, Energy and AI; Raoul Pal, GMI",
            ),
            ResearchMetric(
                id="google-tokens",
                label="Google token volume",
                value="~330× in 2 years",
                detail="Tokens processed across Google products: 9.7 trillion (May 2024) → 480 trillion (May 2025) → 3.2 quadrillion (May 2026). Cheaper intelligence has not shrunk spending (Jevons).",
                as_of="May 2026",
                source="Google I/O 2026 / Sundar Pichai",
            ),
            ResearchMetric(
                id="revenue-per-mw",
                label="Revenue per MW (modeled)",
                value="$16M → $60M",
                detail="SemiAnalysis models Anthropic revenue per megawatt of compute at about $16 million in late 2025, heading toward $60 million in 2026, with gross margin moving from deeply negative toward the mid-60s. Outside estimates, not audited numbers.",
                as_of="2025–2026",
                source="SemiAnalysis",
            ),
        ),
    ),
)

SPREADS: tuple[SpreadSpec, ...] = (
    SpreadSpec(
        id="compute-spread",
        label="Compute vs energy",
        description="Ribbit's compute spread, proxied: equal-weight AI silicon and hyperscalers minus oil, utilities, and power generators. The gap between the value of machine work and the energy required to produce it.",
        long_tickers=("NVDA", "AVGO", "TSM", "MSFT", "GOOGL"),
        short_tickers=("XLE", "XLU", "VST", "CEG"),
    ),
    SpreadSpec(
        id="power-vs-oil",
        label="Power vs oil",
        description="Electricity-side generators minus crude and energy producers. Positive when the market values watts more than barrels.",
        long_tickers=("VST", "CEG", "NEE", "XLU"),
        short_tickers=("CL=F", "XLE"),
    ),
    SpreadSpec(
        id="spark-proxy",
        label="Power vs gas",
        description="A listed-market echo of the spark spread: competitive generators minus Henry Hub. Thermal plants live on this gap.",
        long_tickers=("VST", "NRG", "CEG"),
        short_tickers=("NG=F",),
    ),
)

_cache_lock = threading.Lock()
_cache: dict[str, object] = {"payload": None, "expires": 0.0}


def all_tickers() -> list[str]:
    seen: list[str] = []
    for panel in PANELS:
        for inst in panel.instruments:
            if inst.ticker not in seen:
                seen.append(inst.ticker)
    for spread in SPREADS:
        for ticker in (*spread.long_tickers, *spread.short_tickers):
            if ticker not in seen:
                seen.append(ticker)
    return seen


def equal_weight_return(histories: dict[str, list[float]], tickers: Sequence[str], days: int) -> float | None:
    """Average percent return across tickers that have enough history."""
    returns: list[float] = []
    for ticker in tickers:
        closes = histories.get(ticker)
        if not closes:
            continue
        value = compute_performance(closes, days)
        if value is not None:
            returns.append(value)
    if not returns:
        return None
    return sum(returns) / len(returns)


def spread_return(
    histories: dict[str, list[float]],
    long_tickers: Sequence[str],
    short_tickers: Sequence[str],
    days: int,
) -> float | None:
    long_leg = equal_weight_return(histories, long_tickers, days)
    short_leg = equal_weight_return(histories, short_tickers, days)
    if long_leg is None or short_leg is None:
        return None
    return long_leg - short_leg


def sparkline_values(closes: Sequence[float], points: int = SPARKLINE_POINTS) -> list[float]:
    if not closes:
        return []
    if len(closes) <= points:
        return [round(value, 6) for value in closes]
    step = (len(closes) - 1) / (points - 1)
    sampled: list[float] = []
    for index in range(points):
        source = min(len(closes) - 1, int(round(index * step)))
        sampled.append(round(closes[source], 6))
    return sampled


def format_level(value: float | None, kind: str) -> str:
    if value is None:
        return "N/A"
    if kind == "yield":
        return f"{value:.2f}%"
    return format_currency(value)


def fetch_close_histories(tickers: Sequence[str]) -> tuple[dict[str, list[float]], list[str]]:
    unique = list(dict.fromkeys(tickers))
    histories: dict[str, list[float]] = {}
    errors: list[str] = []
    if not unique:
        return histories, errors

    try:
        frame = yf.download(
            tickers=unique,
            period="2y",
            interval="1d",
            auto_adjust=True,
            progress=False,
            threads=True,
            timeout=20,
            group_by="ticker",
        )
        histories.update(_closes_from_download(frame, unique))
    except Exception as exc:  # pragma: no cover - network/library failures
        LOGGER.exception("Batch Yahoo download failed")
        errors.append(f"Batch download failed: {exc}")

    missing = [ticker for ticker in unique if ticker not in histories]
    for ticker in missing:
        try:
            history = yf.Ticker(ticker).history(period="2y", interval="1d", auto_adjust=True)
            closes = _series_to_closes(history["Close"] if "Close" in history else None)
            if len(closes) >= 2:
                histories[ticker] = closes
            else:
                errors.append(f"No quote data for {ticker}.")
        except Exception as exc:  # pragma: no cover
            errors.append(f"Skipping {ticker}: {exc}")
    return histories, errors


def _series_to_closes(series: object) -> list[float]:
    if series is None:
        return []
    values: list[float] = []
    try:
        dropped = series.dropna()
        for value in dropped.tolist():
            number = float(value)
            if number == number:  # not NaN
                values.append(number)
    except Exception:
        return []
    return values


def _closes_from_download(frame: object, tickers: Sequence[str]) -> dict[str, list[float]]:
    result: dict[str, list[float]] = {}
    if frame is None:
        return result
    empty = getattr(frame, "empty", True)
    if empty:
        return result

    columns = getattr(frame, "columns", None)
    if columns is None:
        return result

    if getattr(columns, "nlevels", 1) > 1:
        level_zero = {str(value) for value in columns.get_level_values(0)}
        for ticker in tickers:
            closes: list[float] = []
            try:
                if ticker in level_zero:
                    sub = frame[ticker]
                    if hasattr(sub, "columns") and "Close" in sub.columns:
                        closes = _series_to_closes(sub["Close"])
                elif "Close" in level_zero:
                    closes = _series_to_closes(frame["Close"][ticker])
            except Exception:
                continue
            if len(closes) >= 2:
                result[ticker] = closes
        return result

    if "Close" in columns and len(tickers) == 1:
        closes = _series_to_closes(frame["Close"])
        if len(closes) >= 2:
            result[tickers[0]] = closes
    return result


def instrument_row(instrument: Instrument, closes: Sequence[float]) -> dict[str, object]:
    price = closes[-1] if closes else None
    performance: dict[str, object] = {}
    for label, days in DASHBOARD_WINDOWS:
        change = compute_performance(closes, days) if closes else None
        performance[label] = {
            "value": change,
            "display": format_percent(change),
            "className": performance_class(change),
        }
    return {
        "ticker": instrument.ticker,
        "name": instrument.name,
        "role": instrument.role,
        "kind": instrument.kind,
        "price": format_level(price, instrument.kind),
        "priceValue": price,
        "windows": performance,
        "sparkline": sparkline_values(closes),
    }


def serialize_spread(spec: SpreadSpec, histories: dict[str, list[float]]) -> dict[str, object]:
    windows: dict[str, object] = {}
    for label, days in DASHBOARD_WINDOWS:
        change = spread_return(histories, spec.long_tickers, spec.short_tickers, days)
        windows[label] = {
            "value": change,
            "display": format_percent(change),
            "className": performance_class(change),
        }
    return {
        "id": spec.id,
        "label": spec.label,
        "description": spec.description,
        "longTickers": list(spec.long_tickers),
        "shortTickers": list(spec.short_tickers),
        "windows": windows,
        "coverage": {
            "long": [ticker for ticker in spec.long_tickers if ticker in histories],
            "short": [ticker for ticker in spec.short_tickers if ticker in histories],
        },
    }


def serialize_metric(metric: ResearchMetric) -> dict[str, str]:
    return {
        "id": metric.id,
        "label": metric.label,
        "value": metric.value,
        "detail": metric.detail,
        "asOf": metric.as_of,
        "source": metric.source,
    }


def serialize_panel(spec: PanelSpec, histories: dict[str, list[float]]) -> dict[str, object]:
    rows = [
        instrument_row(instrument, histories.get(instrument.ticker, []))
        for instrument in spec.instruments
    ]
    return {
        "id": spec.id,
        "title": spec.title,
        "watch": spec.watch,
        "tickers": [instrument.ticker for instrument in spec.instruments],
        "metrics": [serialize_metric(metric) for metric in spec.metrics],
        "rows": rows,
    }


def build_dashboard(
    histories: dict[str, list[float]] | None = None,
    errors: list[str] | None = None,
    *,
    fetch: FetchHistories | None = None,
    use_cache: bool = True,
) -> dict[str, object]:
    """Assemble the Watts dashboard payload.

    Pass `histories` to skip the network (tests). Live calls cache for
    CACHE_TTL_SECONDS so the UI can refresh without hammering Yahoo.
    """
    if histories is None and use_cache:
        with _cache_lock:
            payload = _cache["payload"]
            expires = float(_cache["expires"])
            if payload is not None and expires > time.time():
                return payload  # type: ignore[return-value]

    fetch_errors: list[str] = list(errors or [])
    if histories is None:
        fetcher = fetch or fetch_close_histories
        histories, network_errors = fetcher(all_tickers())
        fetch_errors.extend(network_errors)

    payload: dict[str, object] = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "title": "Watts Into Thoughts",
        "subtitle": "Why intelligence per unit of energy is the number to watch",
        "thesis": (
            "The countries and companies that mastered hydrocarbons captured much of "
            "the wealth of the last century. The next fortunes may belong to whoever "
            "converts electrons into thought most efficiently."
        ),
        "sourceNote": (
            "Live legs are Yahoo Finance total-return proxies, not official power or "
            "token statistics. Research snapshots are dated figures from Nicoletos "
            "(Aug 2026), Pal / GMI, Ribbit Capital, IEA, LBNL, Goldman, McKinsey, "
            "and the other sources listed on each card."
        ),
        "northStar": {
            "title": "Electrons into thought",
            "lede": (
                "Two curves lift the same ratio: manufactured energy gets cheaper, "
                "and every chip generation produces more useful work per watt. "
                "The listed-market echo is the compute spread."
            ),
            "spreads": [serialize_spread(spec, histories) for spec in SPREADS],
        },
        "panels": [serialize_panel(panel, histories) for panel in PANELS],
        "errors": fetch_errors,
    }

    if use_cache and fetch is None and errors is None:
        with _cache_lock:
            _cache["payload"] = payload
            _cache["expires"] = time.time() + CACHE_TTL_SECONDS
    return payload


def clear_cache() -> None:
    with _cache_lock:
        _cache["payload"] = None
        _cache["expires"] = 0.0
