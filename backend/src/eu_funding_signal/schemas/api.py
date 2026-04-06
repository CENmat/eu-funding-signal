from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class CandidatePartnerInput(BaseModel):
    name: str
    country: str = ""
    role: str | None = None
    organisationType: str | None = None


class SearchRequest(BaseModel):
    query: str
    filters: dict[str, Any] | None = None
    approvedExpansions: list[str] | None = Field(default=None)
    candidatePartners: list[CandidatePartnerInput] = Field(default_factory=list)


class ScenarioCompareRequest(BaseModel):
    query: str
    candidates: list[CandidatePartnerInput] = Field(default_factory=list)


class UploadPreviewResponse(BaseModel):
    filename: str
    size: int
    detectedType: str
    previewRows: list[dict[str, Any]]

