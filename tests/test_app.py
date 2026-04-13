import unittest

from xscout.app import (
    StockSnapshot,
    compute_performance,
    format_market_cap,
    parse_tickers,
    sort_snapshots,
)


class ParseTickersTests(unittest.TestCase):
    def test_empty_ticker_list_falls_back_to_defaults(self) -> None:
        self.assertEqual(
            parse_tickers(" , , "),
            ["AAPL", "MSFT", "GOOG", "AMZN", "NVDA", "TSLA"],
        )

    def test_parse_tickers_normalizes_case_and_whitespace(self) -> None:
        self.assertEqual(parse_tickers(" aapl, msft ,nvda "), ["AAPL", "MSFT", "NVDA"])


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
            StockSnapshot("AAPL", 180.0, 3_000_000_000_000.0, None, None, None, None, None),
            StockSnapshot("MSFT", None, 2_500_000_000_000.0, None, None, None, None, None),
            StockSnapshot("NVDA", 120.0, 2_000_000_000_000.0, None, None, None, None, None),
        ]

        ordered = sort_snapshots(snapshots, "price", descending=True)
        self.assertEqual([snapshot.ticker for snapshot in ordered], ["AAPL", "NVDA", "MSFT"])


class FormatMarketCapTests(unittest.TestCase):
    def test_format_market_cap_uses_human_readable_suffixes(self) -> None:
        self.assertEqual(format_market_cap(1_500_000_000_000.0), "$1.50T")
        self.assertEqual(format_market_cap(2_500_000_000.0), "$2.50B")
        self.assertEqual(format_market_cap(42_000_000.0), "$42.00M")


if __name__ == "__main__":
    unittest.main()
