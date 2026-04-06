"""initial schema

Revision ID: 20260404_0001
Revises:
Create Date: 2026-04-04 10:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector

revision = "20260404_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        "topics",
        sa.Column("id", sa.String(length=120), primary_key=True),
        sa.Column("call_id", sa.String(length=120), nullable=False),
        sa.Column("topic_id", sa.String(length=160), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("programme", sa.String(length=120), nullable=False),
        sa.Column("action_type", sa.String(length=40), nullable=False),
        sa.Column("funding_type", sa.String(length=40), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("deadline", sa.Date(), nullable=True),
        sa.Column("indicative_budget_eur", sa.Float(), nullable=True),
        sa.Column("trl_min", sa.Integer(), nullable=True),
        sa.Column("trl_max", sa.Integer(), nullable=True),
        sa.Column("keywords", sa.JSON(), nullable=True),
        sa.Column("eligibility_text", sa.Text(), nullable=True),
        sa.Column("source_url", sa.Text(), nullable=False),
        sa.Column("last_fetched_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("embedding", Vector(48), nullable=True),
    )
    op.create_table(
        "topic_documents",
        sa.Column("id", sa.String(length=120), primary_key=True),
        sa.Column("topic_id", sa.String(length=120), sa.ForeignKey("topics.id"), nullable=False),
        sa.Column("document_type", sa.String(length=40), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("source_url", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "programme_stats",
        sa.Column("id", sa.String(length=120), primary_key=True),
        sa.Column("programme", sa.String(length=120), nullable=False),
        sa.Column("action_type", sa.String(length=40), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("proposal_count", sa.Integer(), nullable=True),
        sa.Column("success_rate", sa.Float(), nullable=True),
        sa.Column("funded_projects_count", sa.Integer(), nullable=True),
        sa.Column("participants_count", sa.Integer(), nullable=True),
        sa.Column("source_url", sa.Text(), nullable=False),
        sa.Column("fetch_timestamp", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "projects",
        sa.Column("id", sa.String(length=120), primary_key=True),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("objective", sa.Text(), nullable=False),
        sa.Column("programme", sa.String(length=120), nullable=False),
        sa.Column("action_type", sa.String(length=40), nullable=False),
        sa.Column("topic_references", sa.JSON(), nullable=True),
        sa.Column("coordinator_org_id", sa.String(length=120), nullable=True),
        sa.Column("countries", sa.JSON(), nullable=True),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("eu_contribution_eur", sa.Float(), nullable=True),
        sa.Column("activity_type", sa.String(length=40), nullable=True),
        sa.Column("role_mix", sa.JSON(), nullable=True),
        sa.Column("source_url", sa.Text(), nullable=False),
        sa.Column("embedding", Vector(48), nullable=True),
    )
    op.create_table(
        "organisations",
        sa.Column("id", sa.String(length=120), primary_key=True),
        sa.Column("name", sa.String(length=240), nullable=False, unique=True),
        sa.Column("country", sa.String(length=8), nullable=True),
        sa.Column("organisation_type", sa.String(length=120), nullable=True),
        sa.Column("archetype_roles", sa.JSON(), nullable=True),
        sa.Column("domains", sa.JSON(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("past_coordination_count", sa.Integer(), nullable=True),
        sa.Column("past_participation_count", sa.Integer(), nullable=True),
        sa.Column("total_known_funding_eur", sa.Float(), nullable=True),
        sa.Column("source_url", sa.Text(), nullable=False),
        sa.Column("embedding", Vector(48), nullable=True),
    )
    op.create_table(
        "project_participants",
        sa.Column("id", sa.String(length=120), primary_key=True),
        sa.Column("project_id", sa.String(length=120), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("organisation_id", sa.String(length=120), sa.ForeignKey("organisations.id"), nullable=False),
        sa.Column("country", sa.String(length=8), nullable=True),
        sa.Column("role", sa.String(length=80), nullable=True),
        sa.Column("is_coordinator", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_table(
        "fts_records",
        sa.Column("id", sa.String(length=120), primary_key=True),
        sa.Column("beneficiary_name", sa.String(length=240), nullable=False),
        sa.Column("subject", sa.Text(), nullable=True),
        sa.Column("beneficiary_country", sa.String(length=8), nullable=True),
        sa.Column("benefiting_country", sa.String(length=8), nullable=True),
        sa.Column("responsible_department", sa.String(length=120), nullable=True),
        sa.Column("budget_line", sa.String(length=240), nullable=True),
        sa.Column("programme", sa.String(length=120), nullable=True),
        sa.Column("coordinator", sa.String(length=240), nullable=True),
        sa.Column("year", sa.Integer(), nullable=True),
        sa.Column("commitment_contracted_amount", sa.Float(), nullable=True),
        sa.Column("commitment_total_amount", sa.Float(), nullable=True),
        sa.Column("beneficiary_awarded_amount", sa.Float(), nullable=True),
        sa.Column("source_url", sa.Text(), nullable=False),
    )
    op.create_table(
        "search_runs",
        sa.Column("id", sa.String(length=120), primary_key=True),
        sa.Column("query", sa.Text(), nullable=False),
        sa.Column("filters", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("result_count", sa.Integer(), nullable=False),
    )
    op.create_table(
        "search_expansions",
        sa.Column("id", sa.String(length=120), primary_key=True),
        sa.Column("search_run_id", sa.String(length=120), sa.ForeignKey("search_runs.id"), nullable=False),
        sa.Column("term", sa.String(length=240), nullable=False),
        sa.Column("accepted", sa.Boolean(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
    )
    op.create_table(
        "organisation_aliases",
        sa.Column("id", sa.String(length=120), primary_key=True),
        sa.Column("organisation_id", sa.String(length=120), sa.ForeignKey("organisations.id"), nullable=False),
        sa.Column("alias", sa.String(length=240), nullable=False),
    )
    op.create_table(
        "collaboration_edges",
        sa.Column("id", sa.String(length=120), primary_key=True),
        sa.Column("source_org_id", sa.String(length=120), sa.ForeignKey("organisations.id"), nullable=False),
        sa.Column("target_org_id", sa.String(length=120), sa.ForeignKey("organisations.id"), nullable=False),
        sa.Column("weight", sa.Float(), nullable=False),
        sa.Column("recency_weight", sa.Float(), nullable=True),
        sa.Column("topic_weight", sa.Float(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "scenario_inputs",
        sa.Column("id", sa.String(length=120), primary_key=True),
        sa.Column("query", sa.Text(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "scenario_scores",
        sa.Column("id", sa.String(length=120), primary_key=True),
        sa.Column("scenario_input_id", sa.String(length=120), sa.ForeignKey("scenario_inputs.id"), nullable=False),
        sa.Column("candidate_name", sa.String(length=240), nullable=False),
        sa.Column("matched_organisation_id", sa.String(length=120), sa.ForeignKey("organisations.id"), nullable=True),
        sa.Column("score", sa.Float(), nullable=False),
        sa.Column("delta_vs_best", sa.Float(), nullable=False),
        sa.Column("rationale", sa.JSON(), nullable=True),
    )
    op.create_table(
        "refresh_logs",
        sa.Column("id", sa.String(length=120), primary_key=True),
        sa.Column("source", sa.String(length=120), nullable=False),
        sa.Column("status", sa.String(length=80), nullable=False),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "source_cache",
        sa.Column("id", sa.String(length=120), primary_key=True),
        sa.Column("source", sa.String(length=120), nullable=False),
        sa.Column("cache_key", sa.String(length=240), nullable=False),
        sa.Column("content_type", sa.String(length=120), nullable=True),
        sa.Column("content_hash", sa.String(length=120), nullable=True),
        sa.Column("payload", sa.LargeBinary(), nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    for table in [
        "source_cache",
        "refresh_logs",
        "scenario_scores",
        "scenario_inputs",
        "collaboration_edges",
        "organisation_aliases",
        "search_expansions",
        "search_runs",
        "fts_records",
        "project_participants",
        "organisations",
        "projects",
        "programme_stats",
        "topic_documents",
        "topics",
    ]:
        op.drop_table(table)

