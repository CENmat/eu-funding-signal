from __future__ import annotations

import csv
import io

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import ORJSONResponse

from eu_funding_signal.core.demo_loader import write_upload_file
from eu_funding_signal.core.settings import settings
from eu_funding_signal.schemas.api import ScenarioCompareRequest, SearchRequest, UploadPreviewResponse
from eu_funding_signal.services.engine import engine

app = FastAPI(
    title="EU Funding Signal API",
    default_response_class=ORJSONResponse,
    description="Explainable public-data decision support for EU funding opportunity prioritisation.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "mode": settings.app_mode}


@app.post("/api/search")
def search(request: SearchRequest) -> dict:
    return engine.search(
        query=request.query,
        filters=request.filters,
        approved_expansions=request.approvedExpansions,
        candidate_partners=[candidate.model_dump() for candidate in request.candidatePartners],
    )


@app.get("/api/topics/{topic_id}")
def topic_detail(topic_id: str, query: str | None = None) -> dict:
    result = engine.get_topic_detail(topic_id, query)
    if result is None:
        raise HTTPException(status_code=404, detail="Topic not found")
    return result


@app.get("/api/organisations/{organisation_id}")
def organisation_detail(organisation_id: str, query: str | None = None) -> dict:
    result = engine.get_organisation_detail(organisation_id, query)
    if result is None:
        raise HTTPException(status_code=404, detail="Organisation not found")
    return result


@app.post("/api/scenario/compare")
def scenario_compare(request: ScenarioCompareRequest) -> dict:
    return engine.compare_scenario(request.query, [candidate.model_dump() for candidate in request.candidates])


@app.get("/api/admin/status")
def admin_status() -> dict:
    return engine.admin_snapshot()


@app.get("/api/admin/validate")
def validate(split_year: int = 2024, k: int = 3) -> dict:
    return engine.validate(split_year=split_year, k=k)


@app.post("/api/admin/uploads/preview", response_model=UploadPreviewResponse)
async def upload_preview(file: UploadFile = File(...)) -> UploadPreviewResponse:
    payload = await file.read()
    write_upload_file(file.filename or "upload.bin", payload)
    preview_rows: list[dict] = []
    detected_type = file.content_type or "application/octet-stream"
    if file.filename and file.filename.lower().endswith(".csv"):
        reader = csv.DictReader(io.StringIO(payload.decode("utf-8")))
        preview_rows = list(reader)[:5]
        detected_type = "text/csv"
    return UploadPreviewResponse(
        filename=file.filename or "upload.bin",
        size=len(payload),
        detectedType=detected_type,
        previewRows=preview_rows,
    )

