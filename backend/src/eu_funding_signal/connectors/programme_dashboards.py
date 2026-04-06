from __future__ import annotations

from pathlib import Path

import httpx

from eu_funding_signal.connectors.base import ConnectorFetchResult, load_tabular_file
from eu_funding_signal.core.demo_loader import write_cache_file

DEFAULT_URL = "https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/programmes/programme-dashboards"


def fetch_programme_stats(
    manual_file: Path | None = None, source_url: str = DEFAULT_URL
) -> ConnectorFetchResult:
    if manual_file:
        records = load_tabular_file(manual_file)
        return ConnectorFetchResult(
            records=records,
            source_url=str(manual_file),
            mode="manual_upload",
            message=f"Loaded {len(records)} programme-stat rows from manual file.",
        )

    response = httpx.get(source_url, timeout=30.0, follow_redirects=True)
    response.raise_for_status()
    write_cache_file("programme_dashboards.html", response.content)
    return ConnectorFetchResult(
        records=[],
        source_url=source_url,
        mode="public_html_snapshot",
        message="Fetched programme dashboard landing page. Structured download fallback still preferred.",
    )

