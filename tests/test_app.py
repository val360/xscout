import unittest
from unittest.mock import patch

from xscout.app import (
    StockSnapshot,
    app,
    compute_performance,
    format_market_cap,
    parse_tickers,
    sort_snapshots,
)


class ParseTickersTests(unittest.TestCase):
    def test_empty_ticker_list_returns_empty_list(self) -> None:
        self.assertEqual(parse_tickers(" , , "), [])

    def test_parse_tickers_normalizes_case_and_whitespace(self) -> None:
        self.assertEqual(parse_tickers(" aapl, msft ,nvda "), ["AAPL", "MSFT", "NVDA"])

    def test_parse_tickers_accepts_space_separated_input(self) -> None:
        self.assertEqual(parse_tickers("aapl msft\nnvda"), ["AAPL", "MSFT", "NVDA"])


class ComputePerformanceTests(unittest.TestCase):
    def test_compute_performance_uses_requested_trading_window(self) -> None:
        closes = [100.0, 103.0, 105.0, 109.0, 111.0, 115.0]
        self.assertAlmostEqual(compute_performance(closes, 5), 15.0)

    def test_compute_performance_returns_none_without_enough_history(self) -> None:
        self.assertIsNone(compute_performance([100.0], 1))
        self.assertIsNone(compute_performance([100.0, 101.0], 5))


class SortSnapshotsTests(unittest.TestCase):
    def test_numeric_sort_keeps_missing_values_last(self) -> None:
        snapshots = [
            StockSnapshot("AAPL", 180.0, 3_000_000_000_000.0, None, None, None, None, None, None, None, None),
            StockSnapshot("MSFT", None, 2_500_000_000_000.0, None, None, None, None, None, None, None, None),
            StockSnapshot("NVDA", 120.0, 2_000_000_000_000.0, None, None, None, None, None, None, None, None),
        ]

        ordered = sort_snapshots(snapshots, "price", descending=True)
        self.assertEqual([snapshot.ticker for snapshot in ordered], ["AAPL", "NVDA", "MSFT"])


class FormatMarketCapTests(unittest.TestCase):
    def test_format_market_cap_uses_human_readable_suffixes(self) -> None:
        self.assertEqual(format_market_cap(1_500_000_000_000.0), "$1.50T")
        self.assertEqual(format_market_cap(2_500_000_000.0), "$2.50B")
        self.assertEqual(format_market_cap(42_000_000.0), "$42.00M")


class WebAppTests(unittest.TestCase):
    def test_get_page_serves_frontend_entrypoint(self) -> None:
        response = app.test_client().get("/")
        self.addCleanup(response.close)

        self.assertEqual(response.status_code, 200)
        self.assertIn(response.mimetype, {"text/html", "text/plain"})

    def test_empty_api_request_does_not_fall_back_to_default_tickers(self) -> None:
        with patch("xscout.market_data.fetch_snapshot") as fetch_snapshot:
            response = app.test_client().post(
                "/api/watchlists/performance",
                json={"tickers": []},
            )

        self.assertEqual(response.status_code, 200)
        fetch_snapshot.assert_not_called()
        self.assertEqual(
            response.get_json(),
            {
                "rows": [],
                "errors": ["Enter at least one ticker to show performance."],
            },
        )

    def test_api_returns_watchlist_performance_rows(self) -> None:
        snapshots = {
            "AAPL": StockSnapshot("AAPL", 180.0, 3_000_000_000_000.0, 1.2, 2.3, 3.4, 4.5, 5.6, 6.7, 7.8, 8.9),
            "MSFT": StockSnapshot("MSFT", 420.0, 2_500_000_000_000.0, -0.5, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0),
        }

        with patch("xscout.market_data.fetch_snapshot", side_effect=lambda ticker: snapshots[ticker]):
            response = app.test_client().post(
                "/api/watchlists/performance",
                json={"tickers": ["msft", "aapl"]},
            )

        payload = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(payload["errors"], [])
        self.assertEqual([row["ticker"] for row in payload["rows"]], ["AAPL", "MSFT"])
        self.assertEqual(payload["rows"][0]["marketCap"], "$3.00T")
        self.assertEqual(payload["rows"][0]["change1d"], "+1.20%")
        self.assertEqual(payload["rows"][1]["change1d"], "-0.50%")


if __name__ == "__main__":
    unittest.main()
