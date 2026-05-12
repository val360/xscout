"""Repository functions for the ``ticker_lists`` table.

The public surface is intentionally small — Flask route handlers call
into these functions, and tests mock them out at this boundary so route
tests need not run against a real database.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Sequence
from uuid import UUID

from .db import get_pool
from .market_data import parse_tickers as _normalise_tickers

NAME_MAX_LENGTH = 120
TICKER_MAX_LENGTH = 16
MAX_TICKERS_PER_LIST = 200


class TickerListNotFoundError(LookupError):
    """Raised when an update/delete targets an id that does not exist."""


class TickerListValidationError(ValueError):
    """Raised when client input fails validation."""


@dataclass(frozen=True)
class TickerList:
    id: UUID
    name: str
    tickers: list[str]
    created_at: datetime
    updated_at: datetime

    def to_api(self) -> dict[str, Any]:
        return {
            "id": str(self.id),
            "name": self.name,
            "tickers": list(self.tickers),
            "createdAt": self.created_at.isoformat(),
            "updatedAt": self.updated_at.isoformat(),
        }


def list_all() -> list[TickerList]:
    with get_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, name, tickers, created_at, updated_at
                  FROM ticker_lists
              ORDER BY created_at ASC
                """
            )
            return [_row_to_model(row) for row in cur.fetchall()]


def create(*, name: str, tickers: Sequence[str]) -> TickerList:
    clean_name = _validate_name(name)
    clean_tickers = _validate_tickers(tickers)

    with get_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO ticker_lists (name, tickers)
                     VALUES (%s, %s)
                  RETURNING id, name, tickers, created_at, updated_at
                """,
                (clean_name, clean_tickers),
            )
            row = cur.fetchone()
            conn.commit()
    assert row is not None
    return _row_to_model(row)


def update(
    list_id: str | UUID,
    *,
    name: str | None = None,
    tickers: Sequence[str] | None = None,
) -> TickerList:
    list_uuid = _coerce_uuid(list_id)

    fields: list[str] = []
    values: list[Any] = []

    if name is not None:
        fields.append("name = %s")
        values.append(_validate_name(name))

    if tickers is not None:
        fields.append("tickers = %s")
        values.append(_validate_tickers(tickers))

    if not fields:
        raise TickerListValidationError(
            "At least one of 'name' or 'tickers' must be provided."
        )

    fields.append("updated_at = now()")
    values.append(list_uuid)

    sql = (
        "UPDATE ticker_lists SET "
        + ", ".join(fields)
        + " WHERE id = %s RETURNING id, name, tickers, created_at, updated_at"
    )

    with get_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, values)
            row = cur.fetchone()
            if row is None:
                conn.rollback()
                raise TickerListNotFoundError(str(list_uuid))
            conn.commit()
    return _row_to_model(row)


def delete(list_id: str | UUID) -> None:
    list_uuid = _coerce_uuid(list_id)

    with get_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM ticker_lists WHERE id = %s", (list_uuid,))
            deleted = cur.rowcount
            conn.commit()
    if deleted == 0:
        raise TickerListNotFoundError(str(list_uuid))


def _row_to_model(row: Sequence[Any]) -> TickerList:
    list_id, name, tickers, created_at, updated_at = row
    return TickerList(
        id=list_id if isinstance(list_id, UUID) else UUID(str(list_id)),
        name=name,
        tickers=list(tickers or []),
        created_at=created_at,
        updated_at=updated_at,
    )


def _coerce_uuid(value: str | UUID) -> UUID:
    if isinstance(value, UUID):
        return value
    try:
        return UUID(str(value))
    except ValueError as exc:
        raise TickerListValidationError(f"Invalid list id: {value!r}") from exc


def _validate_name(raw: Any) -> str:
    if not isinstance(raw, str):
        raise TickerListValidationError("'name' must be a string.")
    cleaned = raw.strip()
    if not cleaned:
        raise TickerListValidationError("'name' must not be empty.")
    if len(cleaned) > NAME_MAX_LENGTH:
        raise TickerListValidationError(
            f"'name' must be {NAME_MAX_LENGTH} characters or fewer."
        )
    return cleaned


def _validate_tickers(raw: Any) -> list[str]:
    if isinstance(raw, str):
        tickers = _normalise_tickers(raw)
    elif isinstance(raw, (list, tuple)):
        joined = " ".join(str(item) for item in raw)
        tickers = _normalise_tickers(joined)
    else:
        raise TickerListValidationError(
            "'tickers' must be a list of strings or a delimited string."
        )

    if len(tickers) > MAX_TICKERS_PER_LIST:
        raise TickerListValidationError(
            f"A ticker list may contain at most {MAX_TICKERS_PER_LIST} symbols."
        )
    for ticker in tickers:
        if len(ticker) > TICKER_MAX_LENGTH:
            raise TickerListValidationError(
                f"Ticker symbol too long: {ticker!r}."
            )
    return tickers


__all__ = (
    "TickerList",
    "TickerListNotFoundError",
    "TickerListValidationError",
    "list_all",
    "create",
    "update",
    "delete",
)
