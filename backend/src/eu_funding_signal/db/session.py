from __future__ import annotations

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from eu_funding_signal.core.settings import settings

engine = create_engine(settings.database_url, future=True) if settings.database_url else None
SessionLocal = sessionmaker(bind=engine, future=True, autoflush=False, autocommit=False) if engine else None

