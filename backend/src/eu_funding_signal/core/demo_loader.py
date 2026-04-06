from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from eu_funding_signal.core.settings import settings


@lru_cache(maxsize=1)
def load_demo_dataset() -> dict[str, Any]:
    path = settings.resolved_demo_dataset_path
    with path.open("r", encoding="utf-8") as file:
        return json.load(file)


def write_cache_file(name: str, payload: bytes) -> Path:
    settings.resolved_cache_dir.mkdir(parents=True, exist_ok=True)
    destination = settings.resolved_cache_dir / name
    destination.write_bytes(payload)
    return destination


def write_upload_file(name: str, payload: bytes) -> Path:
    settings.resolved_upload_dir.mkdir(parents=True, exist_ok=True)
    destination = settings.resolved_upload_dir / name
    destination.write_bytes(payload)
    return destination

