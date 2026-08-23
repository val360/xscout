"""Unit tests for the Watts Into Thoughts dashboard (no network)."""

from __future__ import annotations

import unittest
from unittest.mock import patch

from xscout import watts
from xscout.app import app
from xscout.market_data import compute_performance


def _closes(start: float, daily_return: float, count: int = 260) -> list[float]:
    values = [start]
    for _ in range(count - 1):
        values.append(values[-1] * (1 + daily_return))
    return values


class EqualWeightAndSpreadTests(unittest.TestCase):
    def test_equal_weight_return_averages_available_names(self) -> None:
        histories = {
            "AAA": _closes(100, 0.01),
            "BBB": _closes(100, 0.00),
        }
        averaged = watts.equal_weight_return(histories, ["AAA", "BBB", "MISSING"], 1)
        expected = (
            compute_performance(histories["AAA"], 1) + compute_performance(histories["BBB"], 1)
        ) / 2
        self.assertIsNotNone(averaged)
        assert averaged is not None
        self.assertAlmostEqual(averaged, expected)

    def test_spread_is_long_minus_short(self) -> None:
        histories = {
            "NVDA": _closes(100, 0.02),
            "XLE": _closes(100, 0.01),
        }
        long_leg = watts.equal_weight_return(histories, ["NVDA"], 21)
        short_leg = watts.equal_weight_return(histories, ["XLE"], 21)
        spread = watts.spread_return(histories, ["NVDA"], ["XLE"], 21)
        self.assertIsNotNone(spread)
        assert spread is not None and long_leg is not None and short_leg is not None
        self.assertAlmostEqual(spread, long_leg - short_leg)

    def test_spread_returns_none_without_both_legs(self) -> None:
        self.assertIsNone(watts.spread_return({"NVDA": _closes(100, 0.01)}, ["NVDA"], ["XLE"], 1))


class SparklineTests(unittest.TestCase):
    def test_sparkline_passthrough_when_short(self) -> None:
        self.assertEqual(watts.sparkline_values([1.0, 2.0, 3.0], points=10), [1.0, 2.0, 3.0])

    def test_sparkline_downsamples_to_requested_length(self) -> None:
        sampled = watts.sparkline_values(list(range(200)), points=60)
        self.assertEqual(len(sampled), 60)
        self.assertEqual(sampled[0], 0.0)
        self.assertEqual(sampled[-1], 199.0)


class FormatLevelTests(unittest.TestCase):
    def test_yield_uses_percent_not_dollars(self) -> None:
        self.assertEqual(watts.format_level(4.251, "yield"), "4.25%")

    def test_price_uses_currency(self) -> None:
        self.assertEqual(watts.format_level(12.5, "price"), "$12.50")


class DashboardAssemblyTests(unittest.TestCase):
    def setUp(self) -> None:
        watts.clear_cache()
        self.histories = {ticker: _closes(100 + index, 0.001) for index, ticker in enumerate(watts.all_tickers())}

    def tearDown(self) -> None:
        watts.clear_cache()

    def test_build_dashboard_includes_every_watch_panel(self) -> None:
        payload = watts.build_dashboard(self.histories, use_cache=False)
        panel_ids = [panel["id"] for panel in payload["panels"]]
        self.assertEqual(
            panel_ids,
            [
                "electricity-prices",
                "grid-queues",
                "transformer-lead-times",
                "financing-conditions",
                "surplus-power",
                "data-center-jurisdictions",
                "intelligence-per-watt",
            ],
        )
        spread_ids = [spread["id"] for spread in payload["northStar"]["spreads"]]
        self.assertEqual(spread_ids, ["compute-spread", "power-vs-oil", "spark-proxy"])
        self.assertTrue(payload["panels"][0]["metrics"])
        self.assertEqual(payload["errors"], [])
        first_row = payload["panels"][0]["rows"][0]
        self.assertIn("1M", first_row["windows"])
        self.assertIn("display", first_row["windows"]["1M"])

    def test_ten_year_yield_is_not_formatted_as_dollars(self) -> None:
        payload = watts.build_dashboard(self.histories, use_cache=False)
        financing = next(panel for panel in payload["panels"] if panel["id"] == "financing-conditions")
        tnx = next(row for row in financing["rows"] if row["ticker"] == "^TNX")
        self.assertTrue(tnx["price"].endswith("%"))
        self.assertFalse(tnx["price"].startswith("$"))

    def test_live_fetch_is_used_when_histories_omitted(self) -> None:
        def fake_fetch(tickers: list[str]) -> tuple[dict[str, list[float]], list[str]]:
            return {ticker: _closes(50, 0.0) for ticker in tickers}, ["skipping DEMO"]

        payload = watts.build_dashboard(fetch=fake_fetch, use_cache=False)
        self.assertIn("skipping DEMO", payload["errors"])
        self.assertEqual(len(payload["panels"]), 7)

    def test_cache_returns_same_object_within_ttl(self) -> None:
        first = watts.build_dashboard(self.histories, use_cache=True)
        second = watts.build_dashboard(use_cache=True)
        self.assertIs(first, second)
        watts.clear_cache()
        third = watts.build_dashboard(self.histories, use_cache=True)
        self.assertIsNot(first, third)


class WattsApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = app.test_client()
        watts.clear_cache()

    def tearDown(self) -> None:
        watts.clear_cache()

    def test_dashboard_endpoint_returns_payload(self) -> None:
        stub = {
            "generatedAt": "2026-08-23T00:00:00+00:00",
            "title": "Watts Into Thoughts",
            "panels": [],
            "northStar": {"spreads": []},
            "errors": [],
        }
        with patch("xscout.watts.build_dashboard", return_value=stub) as builder:
            response = self.client.get("/api/watts/dashboard")

        self.assertEqual(response.status_code, 200)
        builder.assert_called_once_with(use_cache=True)
        body = response.get_json()
        self.assertEqual(body["title"], "Watts Into Thoughts")

    def test_refresh_query_busts_cache(self) -> None:
        stub = {"title": "Watts Into Thoughts", "errors": []}
        with patch("xscout.watts.build_dashboard", return_value=stub) as builder:
            with patch("xscout.watts.clear_cache") as clear:
                response = self.client.get("/api/watts/dashboard?refresh=1")

        self.assertEqual(response.status_code, 200)
        clear.assert_called_once()
        builder.assert_called_once_with(use_cache=False)


if __name__ == "__main__":
    unittest.main()
