from __future__ import annotations

from eu_funding_signal.services.engine import engine


def test_scenario_compare_returns_ranked_candidates() -> None:
    comparison = engine.compare_scenario(
        "battery passport",
        [
            {"name": "VTT", "country": "FI", "role": "research"},
            {"name": "RINA", "country": "IT", "role": "standardisation"},
        ],
    )
    assert comparison["rankedCandidates"]
    assert comparison["recommendedCountryPattern"]

