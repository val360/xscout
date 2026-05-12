"""Database connection, configuration, and migration runner.

Only Postgres is supported. The connection URL is read from the
``DATABASE_URL`` environment variable (which is how Railway exposes the
managed Postgres service to the application). For local development, the
included ``docker-compose.yml`` brings up Postgres on
``postgresql://xscout:xscout@localhost:5432/xscout``.

Migrations live alongside this module in ``xscout/migrations`` as numbered
``NNNN_*.sql`` files. They are applied on application startup, serialised
across Gunicorn workers and replicas with a Postgres advisory lock so two
processes cannot race on the same upgrade.
"""

from __future__ import annotations

import logging
import os
import threading
import time
from pathlib import Path
from typing import Iterable

import psycopg
from psycopg_pool import ConnectionPool

LOGGER = logging.getLogger(__name__)

# Arbitrary but stable 64-bit integer used as the migration advisory lock key.
# Two processes calling pg_advisory_lock with the same key block each other,
# which is exactly what we want so concurrent boots cannot apply migrations
# in parallel.
MIGRATION_ADVISORY_LOCK_KEY = 5_472_983_120_557_311

MIGRATIONS_DIR = Path(__file__).parent / "migrations"

_pool: ConnectionPool | None = None
_pool_lock = threading.Lock()


class DatabaseNotConfiguredError(RuntimeError):
    """Raised when DB access is attempted without a configured DATABASE_URL."""


def get_database_url() -> str | None:
    """Return the configured database URL, normalising legacy ``postgres://``."""

    url = os.environ.get("DATABASE_URL")
    if not url:
        return None
    # SQLAlchemy and psycopg accept the modern ``postgresql://`` form; some
    # providers (and older Heroku-style configs) still hand out ``postgres://``.
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://") :]
    return url


def is_configured() -> bool:
    return get_database_url() is not None


def get_pool() -> ConnectionPool:
    """Return the lazy-initialised process-wide connection pool."""

    global _pool
    if _pool is not None:
        return _pool

    with _pool_lock:
        if _pool is None:
            url = get_database_url()
            if url is None:
                raise DatabaseNotConfiguredError(
                    "DATABASE_URL is not set; cannot open a Postgres connection."
                )
            _pool = ConnectionPool(
                conninfo=url,
                min_size=1,
                max_size=5,
                kwargs={"autocommit": False},
                open=True,
                name="xscout-pool",
            )
    return _pool


def close_pool() -> None:
    """Close the connection pool (used by tests for cleanup)."""

    global _pool
    with _pool_lock:
        if _pool is not None:
            _pool.close()
            _pool = None


def connect_with_retry(
    *,
    attempts: int = 5,
    initial_delay_seconds: float = 1.0,
) -> psycopg.Connection:
    """Open a single short-lived connection, retrying on transient errors.

    Used for the migration step at startup, which runs before the pool is
    touched. Railway occasionally attaches DB networking a moment after the
    web container starts, so a few retries make boots reliable.
    """

    url = get_database_url()
    if url is None:
        raise DatabaseNotConfiguredError(
            "DATABASE_URL is not set; cannot open a Postgres connection."
        )

    delay = initial_delay_seconds
    last_error: Exception | None = None
    for attempt in range(1, attempts + 1):
        try:
            return psycopg.connect(url, autocommit=False)
        except psycopg.OperationalError as exc:
            last_error = exc
            LOGGER.warning(
                "Postgres connect attempt %d/%d failed: %s", attempt, attempts, exc
            )
            if attempt == attempts:
                break
            time.sleep(delay)
            delay = min(delay * 2, 16.0)

    assert last_error is not None
    raise last_error


def run_migrations() -> list[int]:
    """Apply any pending migration files; return the versions actually applied."""

    applied: list[int] = []
    pending = _discover_migrations()

    with connect_with_retry() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT pg_advisory_lock(%s)", (MIGRATION_ADVISORY_LOCK_KEY,)
            )
            try:
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS schema_migrations (
                        version    INTEGER PRIMARY KEY,
                        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
                    )
                    """
                )
                conn.commit()

                cur.execute("SELECT COALESCE(MAX(version), 0) FROM schema_migrations")
                row = cur.fetchone()
                current_version = int(row[0]) if row else 0

                for version, path in pending:
                    if version <= current_version:
                        continue
                    LOGGER.info("Applying migration %s", path.name)
                    sql = path.read_text(encoding="utf-8")
                    cur.execute(sql)
                    cur.execute(
                        "INSERT INTO schema_migrations (version) VALUES (%s)",
                        (version,),
                    )
                    conn.commit()
                    applied.append(version)
            except Exception:
                conn.rollback()
                raise
            finally:
                cur.execute(
                    "SELECT pg_advisory_unlock(%s)", (MIGRATION_ADVISORY_LOCK_KEY,)
                )
                conn.commit()

    return applied


def init_db() -> None:
    """Eagerly run migrations. Safe to call once per process at startup."""

    if not is_configured():
        LOGGER.warning(
            "DATABASE_URL is not set; skipping migrations. The ticker-list API will return 503."
        )
        return
    run_migrations()


def _discover_migrations() -> list[tuple[int, Path]]:
    if not MIGRATIONS_DIR.is_dir():
        return []
    migrations: list[tuple[int, Path]] = []
    for path in sorted(MIGRATIONS_DIR.iterdir()):
        if path.suffix != ".sql":
            continue
        version_token = path.stem.split("_", 1)[0]
        try:
            version = int(version_token)
        except ValueError:
            LOGGER.warning("Skipping migration with non-numeric prefix: %s", path.name)
            continue
        migrations.append((version, path))
    migrations.sort(key=lambda item: item[0])
    return migrations


def reset_pool_for_testing() -> None:
    """Test-only helper to drop the cached pool so it picks up new env vars."""

    close_pool()


__all__: Iterable[str] = (
    "DatabaseNotConfiguredError",
    "MIGRATIONS_DIR",
    "close_pool",
    "connect_with_retry",
    "get_database_url",
    "get_pool",
    "init_db",
    "is_configured",
    "reset_pool_for_testing",
    "run_migrations",
)
