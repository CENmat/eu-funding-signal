from __future__ import annotations

from eu_funding_signal.services.engine import engine


def test_validation_report_is_honest_and_bounded() -> None:
    report = engine.validate(split_year=2024, k=3)
    assert 0 <= report["hitAtK"] <= 1
    assert 0 <= report["ndcgAtK"] <= 1
    assert 0 <= report["coordinatorRecommendationHitRate"] <= 1
    assert "not proposal win/loss accuracy" in report["note"]

