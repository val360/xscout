"""Unit tests for the ticker-list API. Mocks the repository layer so these
tests run without a database."""

from __future__ import annotations

import unittest
from datetime import datetime, timezone
from unittest.mock import patch
from uuid import UUID, uuid4

from xscout import app as app_module
from xscout import ticker_lists


def _make_list(name: str = "Tech", tickers: list[str] | None = None) -> ticker_lists.TickerList:
    return ticker_lists.TickerList(
        id=uuid4(),
        name=name,
        tickers=tickers if tickers is not None else ["AAPL", "MSFT"],
        created_at=datetime(2026, 5, 12, tzinfo=timezone.utc),
        updated_at=datetime(2026, 5, 12, tzinfo=timezone.utc),
    )


class TickerListApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = app_module.app.test_client()
        configured_patcher = patch.object(app_module.db, "is_configured", return_value=True)
        configured_patcher.start()
        self.addCleanup(configured_patcher.stop)

    def test_list_returns_all_records(self) -> None:
        sample = _make_list()
        with patch.object(app_module.ticker_lists, "list_all", return_value=[sample]):
            response = self.client.get("/api/ticker-lists")

        self.assertEqual(response.status_code, 200)
        body = response.get_json()
        self.assertEqual(len(body["lists"]), 1)
        self.assertEqual(body["lists"][0]["id"], str(sample.id))
        self.assertEqual(body["lists"][0]["tickers"], ["AAPL", "MSFT"])

    def test_create_returns_201_with_created_row(self) -> None:
        created = _make_list(name="Big Tech", tickers=["AAPL", "GOOGL"])
        with patch.object(
            app_module.ticker_lists, "create", return_value=created
        ) as create_mock:
            response = self.client.post(
                "/api/ticker-lists",
                json={"name": "Big Tech", "tickers": ["aapl", "googl"]},
            )

        self.assertEqual(response.status_code, 201)
        create_mock.assert_called_once_with(name="Big Tech", tickers=["aapl", "googl"])
        self.assertEqual(response.get_json()["name"], "Big Tech")

    def test_create_rejects_empty_name(self) -> None:
        def boom(**_kwargs: object) -> ticker_lists.TickerList:
            raise ticker_lists.TickerListValidationError("'name' must not be empty.")

        with patch.object(app_module.ticker_lists, "create", side_effect=boom):
            response = self.client.post(
                "/api/ticker-lists",
                json={"name": "  ", "tickers": ["AAPL"]},
            )

        self.assertEqual(response.status_code, 400)
        self.assertIn("name", response.get_json()["error"])

    def test_patch_partial_update(self) -> None:
        updated = _make_list(name="Renamed")
        with patch.object(
            app_module.ticker_lists, "update", return_value=updated
        ) as update_mock:
            response = self.client.patch(
                f"/api/ticker-lists/{updated.id}",
                json={"name": "Renamed"},
            )

        self.assertEqual(response.status_code, 200)
        update_mock.assert_called_once_with(str(updated.id), name="Renamed", tickers=None)
        self.assertEqual(response.get_json()["name"], "Renamed")

    def test_patch_unknown_id_returns_404(self) -> None:
        def boom(*_args: object, **_kwargs: object) -> ticker_lists.TickerList:
            raise ticker_lists.TickerListNotFoundError("missing")

        with patch.object(app_module.ticker_lists, "update", side_effect=boom):
            response = self.client.patch(
                f"/api/ticker-lists/{uuid4()}",
                json={"name": "x"},
            )

        self.assertEqual(response.status_code, 404)

    def test_delete_returns_204(self) -> None:
        with patch.object(app_module.ticker_lists, "delete") as delete_mock:
            response = self.client.delete(f"/api/ticker-lists/{uuid4()}")

        self.assertEqual(response.status_code, 204)
        delete_mock.assert_called_once()

    def test_delete_unknown_id_returns_404(self) -> None:
        def boom(*_args: object, **_kwargs: object) -> None:
            raise ticker_lists.TickerListNotFoundError("missing")

        with patch.object(app_module.ticker_lists, "delete", side_effect=boom):
            response = self.client.delete(f"/api/ticker-lists/{uuid4()}")

        self.assertEqual(response.status_code, 404)

    def test_returns_503_when_database_not_configured(self) -> None:
        with patch.object(app_module.db, "is_configured", return_value=False):
            response = self.client.get("/api/ticker-lists")

        self.assertEqual(response.status_code, 503)
        self.assertIn("DATABASE_URL", response.get_json()["error"])


class TickerListValidationTests(unittest.TestCase):
    """Direct tests for repository-level validation that does not need a DB."""

    def test_validate_tickers_normalises_input(self) -> None:
        self.assertEqual(
            ticker_lists._validate_tickers("aapl, msft\nnvda"),
            ["AAPL", "MSFT", "NVDA"],
        )

    def test_validate_tickers_rejects_too_many(self) -> None:
        too_many = [f"T{idx}" for idx in range(ticker_lists.MAX_TICKERS_PER_LIST + 1)]
        with self.assertRaises(ticker_lists.TickerListValidationError):
            ticker_lists._validate_tickers(too_many)

    def test_validate_name_strips_and_rejects_empty(self) -> None:
        self.assertEqual(ticker_lists._validate_name("  Tech  "), "Tech")
        with self.assertRaises(ticker_lists.TickerListValidationError):
            ticker_lists._validate_name("   ")

    def test_coerce_uuid_rejects_invalid(self) -> None:
        with self.assertRaises(ticker_lists.TickerListValidationError):
            ticker_lists._coerce_uuid("not-a-uuid")

    def test_coerce_uuid_accepts_string_form(self) -> None:
        value = uuid4()
        self.assertEqual(ticker_lists._coerce_uuid(str(value)), value)
        self.assertIsInstance(ticker_lists._coerce_uuid(value), UUID)


if __name__ == "__main__":
    unittest.main()
