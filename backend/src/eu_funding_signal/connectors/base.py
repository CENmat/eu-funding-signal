from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pandas as pd


@dataclass
class ConnectorFetchResult:
    records: list[dict[str, Any]]
    source_url: str
    mode: str
    message: str


def load_tabular_file(path: Path) -> list[dict[str, Any]]:
    suffix = path.suffix.lower()
    if suffix == ".csv":
        return pd.read_csv(path).fillna("").to_dict(orient="records")
    if suffix in {".tsv", ".txt"}:
        return pd.read_csv(path, sep="\t").fillna("").to_dict(orient="records")
    if suffix == ".xlsx":
        return pd.read_excel(path).fillna("").to_dict(orient="records")
    if suffix == ".json":
        data = pd.read_json(path)
        return data.fillna("").to_dict(orient="records")
    raise ValueError(f"Unsupported file type: {suffix}")

