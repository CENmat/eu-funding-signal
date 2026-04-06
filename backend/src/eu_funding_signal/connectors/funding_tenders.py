from __future__ import annotations

from pathlib import Path

import httpx
from bs4 import BeautifulSoup

from eu_funding_signal.connectors.base import ConnectorFetchResult, load_tabular_file
from eu_funding_signal.core.demo_loader import write_cache_file

DEFAULT_URL = "https://ec.europa.eu/info/funding-tenders/opportunities/portal/"


def fetch_topics(manual_file: Path | None = None, source_url: str = DEFAULT_URL) -> ConnectorFetchResult:
    if manual_file:
        records = load_tabular_file(manual_file)
        return ConnectorFetchResult(
            records=records,
            source_url=str(manual_file),
            mode="manual_upload",
            message=f"Loaded {len(records)} topic rows from manual file.",
        )

    response = httpx.get(source_url, timeout=30.0, follow_redirects=True)
    response.raise_for_status()
    write_cache_file("funding_tenders_portal.html", response.content)
    soup = BeautifulSoup(response.text, "html.parser")
    records = []
    for anchor in soup.select("a")[:20]:
        text = " ".join(anchor.get_text(" ", strip=True).split())
        href = anchor.get("href")
        if text and href and len(text) > 15:
            records.append({"title": text, "href": href})
    return ConnectorFetchResult(
        records=records,
        source_url=source_url,
        mode="public_html_snapshot",
        message=f"Fetched portal landing page and extracted {len(records)} candidate links.",
    )

