from __future__ import annotations

from fastapi.testclient import TestClient

from eu_funding_signal.main import app

client = TestClient(app)


def test_health() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_search_returns_ranked_results() -> None:
    response = client.post("/api/search", json={"query": "interposer"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["results"]
    assert payload["results"][0]["topic"]["id"] == "topic_interposer_2026"


def test_topic_detail_exists() -> None:
    response = client.get("/api/topics/topic_battery_passport_2026")
    assert response.status_code == 200
    assert response.json()["topic"]["topicId"] == "HORIZON-CL5-2026-BATT-PASSPORT-02"


def test_upload_preview_csv() -> None:
    response = client.post(
        "/api/admin/uploads/preview",
        files={"file": ("partners.csv", b"organisation name,country\nimec,BE\n", "text/csv")},
    )
    assert response.status_code == 200
    assert response.json()["previewRows"][0]["organisation name"] == "imec"

