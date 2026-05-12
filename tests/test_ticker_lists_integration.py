"""Integration tests that hit a real Postgres.

Skipped unless ``TEST_DATABASE_URL`` is set. The included
``docker-compose.yml`` brings up a local Postgres; setting

    export TEST_DATABASE_URL=postgresql://xscout:xscout@localhost:5432/xscout

before running ``.venv/bin/python -m unittest discover -s tests`` is enough
to exercise these tests locally.
"""

from __future__ import annotations

import os
import unittest

from xscout import db, ticker_lists


_TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")


@unittest.skipUnless(
    _TEST_DATABASE_URL, "TEST_DATABASE_URL is not set; skipping integration tests."
)
class TickerListsIntegrationTests(unittest.TestCase):
    _original_database_url: str | None = None

    @classmethod
    def setUpClass(cls) -> None:
        cls._original_database_url = os.environ.get("DATABASE_URL")
        os.environ["DATABASE_URL"] = _TEST_DATABASE_URL  # type: ignore[assignment]
        db.reset_pool_for_testing()
        db.run_migrations()

    @classmethod
    def tearDownClass(cls) -> None:
        db.close_pool()
        if cls._original_database_url is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = cls._original_database_url

    def setUp(self) -> None:
        with db.get_pool().connection() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM ticker_lists")
                conn.commit()

    def test_create_then_list(self) -> None:
        created = ticker_lists.create(name="Tech", tickers=["aapl", "MSFT"])
        self.assertEqual(created.name, "Tech")
        self.assertEqual(created.tickers, ["AAPL", "MSFT"])

        rows = ticker_lists.list_all()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].id, created.id)

    def test_update_rename_and_replace_tickers(self) -> None:
        created = ticker_lists.create(name="Tech", tickers=["AAPL"])
        renamed = ticker_lists.update(created.id, name="Renamed")
        self.assertEqual(renamed.name, "Renamed")
        self.assertEqual(renamed.tickers, ["AAPL"])

        with_new_tickers = ticker_lists.update(created.id, tickers=["GOOGL", "AMZN"])
        self.assertEqual(with_new_tickers.tickers, ["GOOGL", "AMZN"])

    def test_update_missing_raises(self) -> None:
        import uuid

        with self.assertRaises(ticker_lists.TickerListNotFoundError):
            ticker_lists.update(uuid.uuid4(), name="nope")

    def test_delete_removes_row(self) -> None:
        created = ticker_lists.create(name="Tech", tickers=["AAPL"])
        ticker_lists.delete(created.id)
        self.assertEqual(ticker_lists.list_all(), [])

    def test_delete_missing_raises(self) -> None:
        import uuid

        with self.assertRaises(ticker_lists.TickerListNotFoundError):
            ticker_lists.delete(uuid.uuid4())

    def test_run_migrations_is_idempotent(self) -> None:
        # Already migrated in setUpClass; a second call should apply nothing.
        self.assertEqual(db.run_migrations(), [])


if __name__ == "__main__":
    unittest.main()
