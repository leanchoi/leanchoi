"""Motor de base de datos y sesiones (SQLite en dev, Postgres en prod)."""
from __future__ import annotations

from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from .config import get_settings

_settings = get_settings()

if _settings.database_url.startswith("sqlite"):
    db_path = _settings.database_url.replace("sqlite:///", "", 1)
    if db_path and db_path != ":memory:":
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)

_connect_args = {"check_same_thread": False} if _settings.database_url.startswith("sqlite") else {}

engine = create_engine(
    _settings.database_url, echo=False, future=True,
    pool_pre_ping=True, connect_args=_connect_args,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, class_=Session)


def init_db() -> None:
    from .models import Base  # import diferido para registrar modelos
    Base.metadata.create_all(engine)
    _ensure_columns()


# Migración liviana: agrega columnas nuevas a tablas ya existentes sin Alembic.
# (create_all crea tablas faltantes pero NO altera las existentes.)
_MIGRATIONS = {
    "listings": [
        ("property_type_raw", "VARCHAR(120)"),
        ("typology_manual", "BOOLEAN DEFAULT FALSE"),
    ],
}


def _ensure_columns() -> None:
    from sqlalchemy import inspect, text
    insp = inspect(engine)
    with engine.begin() as conn:
        for table, cols in _MIGRATIONS.items():
            if not insp.has_table(table):
                continue
            existing = {c["name"] for c in insp.get_columns(table)}
            for name, ddl in cols:
                if name not in existing:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))


@contextmanager
def session_scope() -> Iterator[Session]:
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def get_session() -> Iterator[Session]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
