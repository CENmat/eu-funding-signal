from __future__ import annotations

from datetime import date, datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, JSON, LargeBinary, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from eu_funding_signal.db.base import Base


class Topic(Base):
    __tablename__ = "topics"

    id: Mapped[str] = mapped_column(String(120), primary_key=True)
    call_id: Mapped[str] = mapped_column(String(120))
    topic_id: Mapped[str] = mapped_column(String(160))
    title: Mapped[str] = mapped_column(Text)
    description: Mapped[str] = mapped_column(Text)
    programme: Mapped[str] = mapped_column(String(120))
    action_type: Mapped[str] = mapped_column(String(40))
    funding_type: Mapped[str] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(20))
    deadline: Mapped[date | None] = mapped_column(Date, nullable=True)
    indicative_budget_eur: Mapped[float | None] = mapped_column(Float, nullable=True)
    trl_min: Mapped[int | None]
    trl_max: Mapped[int | None]
    keywords: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    eligibility_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_url: Mapped[str] = mapped_column(Text)
    last_fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    embedding: Mapped[list[float] | None] = mapped_column(Vector(48), nullable=True)


class TopicDocument(Base):
    __tablename__ = "topic_documents"

    id: Mapped[str] = mapped_column(String(120), primary_key=True)
    topic_id: Mapped[str] = mapped_column(ForeignKey("topics.id"))
    document_type: Mapped[str] = mapped_column(String(40))
    content: Mapped[str] = mapped_column(Text)
    source_url: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class ProgrammeStat(Base):
    __tablename__ = "programme_stats"

    id: Mapped[str] = mapped_column(String(120), primary_key=True)
    programme: Mapped[str] = mapped_column(String(120))
    action_type: Mapped[str] = mapped_column(String(40))
    year: Mapped[int]
    proposal_count: Mapped[int | None]
    success_rate: Mapped[float | None]
    funded_projects_count: Mapped[int | None]
    participants_count: Mapped[int | None]
    source_url: Mapped[str] = mapped_column(Text)
    fetch_timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(120), primary_key=True)
    title: Mapped[str] = mapped_column(Text)
    objective: Mapped[str] = mapped_column(Text)
    programme: Mapped[str] = mapped_column(String(120))
    action_type: Mapped[str] = mapped_column(String(40))
    topic_references: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    coordinator_org_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    countries: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    eu_contribution_eur: Mapped[float | None] = mapped_column(Float, nullable=True)
    activity_type: Mapped[str | None] = mapped_column(String(40), nullable=True)
    role_mix: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    source_url: Mapped[str] = mapped_column(Text)
    embedding: Mapped[list[float] | None] = mapped_column(Vector(48), nullable=True)


class Organisation(Base):
    __tablename__ = "organisations"

    id: Mapped[str] = mapped_column(String(120), primary_key=True)
    name: Mapped[str] = mapped_column(String(240), unique=True)
    country: Mapped[str | None] = mapped_column(String(8), nullable=True)
    organisation_type: Mapped[str | None] = mapped_column(String(120), nullable=True)
    archetype_roles: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    domains: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    past_coordination_count: Mapped[int | None]
    past_participation_count: Mapped[int | None]
    total_known_funding_eur: Mapped[float | None]
    source_url: Mapped[str] = mapped_column(Text)
    embedding: Mapped[list[float] | None] = mapped_column(Vector(48), nullable=True)


class ProjectParticipant(Base):
    __tablename__ = "project_participants"

    id: Mapped[str] = mapped_column(String(120), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"))
    organisation_id: Mapped[str] = mapped_column(ForeignKey("organisations.id"))
    country: Mapped[str | None] = mapped_column(String(8), nullable=True)
    role: Mapped[str | None] = mapped_column(String(80), nullable=True)
    is_coordinator: Mapped[bool] = mapped_column(Boolean, default=False)


class FtsRecord(Base):
    __tablename__ = "fts_records"

    id: Mapped[str] = mapped_column(String(120), primary_key=True)
    beneficiary_name: Mapped[str] = mapped_column(String(240))
    subject: Mapped[str | None] = mapped_column(Text, nullable=True)
    beneficiary_country: Mapped[str | None] = mapped_column(String(8), nullable=True)
    benefiting_country: Mapped[str | None] = mapped_column(String(8), nullable=True)
    responsible_department: Mapped[str | None] = mapped_column(String(120), nullable=True)
    budget_line: Mapped[str | None] = mapped_column(String(240), nullable=True)
    programme: Mapped[str | None] = mapped_column(String(120), nullable=True)
    coordinator: Mapped[str | None] = mapped_column(String(240), nullable=True)
    year: Mapped[int | None]
    commitment_contracted_amount: Mapped[float | None]
    commitment_total_amount: Mapped[float | None]
    beneficiary_awarded_amount: Mapped[float | None]
    source_url: Mapped[str] = mapped_column(Text)


class SearchRun(Base):
    __tablename__ = "search_runs"

    id: Mapped[str] = mapped_column(String(120), primary_key=True)
    query: Mapped[str] = mapped_column(Text)
    filters: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    result_count: Mapped[int]


class SearchExpansion(Base):
    __tablename__ = "search_expansions"

    id: Mapped[str] = mapped_column(String(120), primary_key=True)
    search_run_id: Mapped[str] = mapped_column(ForeignKey("search_runs.id"))
    term: Mapped[str] = mapped_column(String(240))
    accepted: Mapped[bool] = mapped_column(Boolean)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)


class OrganisationAlias(Base):
    __tablename__ = "organisation_aliases"

    id: Mapped[str] = mapped_column(String(120), primary_key=True)
    organisation_id: Mapped[str] = mapped_column(ForeignKey("organisations.id"))
    alias: Mapped[str] = mapped_column(String(240))


class CollaborationEdge(Base):
    __tablename__ = "collaboration_edges"

    id: Mapped[str] = mapped_column(String(120), primary_key=True)
    source_org_id: Mapped[str] = mapped_column(ForeignKey("organisations.id"))
    target_org_id: Mapped[str] = mapped_column(ForeignKey("organisations.id"))
    weight: Mapped[float]
    recency_weight: Mapped[float | None]
    topic_weight: Mapped[float | None]
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class ScenarioInput(Base):
    __tablename__ = "scenario_inputs"

    id: Mapped[str] = mapped_column(String(120), primary_key=True)
    query: Mapped[str] = mapped_column(Text)
    payload: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class ScenarioScore(Base):
    __tablename__ = "scenario_scores"

    id: Mapped[str] = mapped_column(String(120), primary_key=True)
    scenario_input_id: Mapped[str] = mapped_column(ForeignKey("scenario_inputs.id"))
    candidate_name: Mapped[str] = mapped_column(String(240))
    matched_organisation_id: Mapped[str | None] = mapped_column(ForeignKey("organisations.id"), nullable=True)
    score: Mapped[float]
    delta_vs_best: Mapped[float]
    rationale: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)


class RefreshLog(Base):
    __tablename__ = "refresh_logs"

    id: Mapped[str] = mapped_column(String(120), primary_key=True)
    source: Mapped[str] = mapped_column(String(120))
    status: Mapped[str] = mapped_column(String(80))
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class SourceCache(Base):
    __tablename__ = "source_cache"

    id: Mapped[str] = mapped_column(String(120), primary_key=True)
    source: Mapped[str] = mapped_column(String(120))
    cache_key: Mapped[str] = mapped_column(String(240))
    content_type: Mapped[str | None] = mapped_column(String(120), nullable=True)
    content_hash: Mapped[str | None] = mapped_column(String(120), nullable=True)
    payload: Mapped[bytes] = mapped_column(LargeBinary)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

