from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import typer

from eu_funding_signal.connectors.cordis import fetch_cordis
from eu_funding_signal.connectors.fts import fetch_fts
from eu_funding_signal.connectors.funding_tenders import fetch_topics
from eu_funding_signal.connectors.programme_dashboards import fetch_programme_stats
from eu_funding_signal.core.demo_loader import load_demo_dataset, write_cache_file
from eu_funding_signal.services.engine import engine

app = typer.Typer(no_args_is_help=True)


def _write_json_cache(name: str, payload: dict[str, Any]) -> Path:
    return write_cache_file(name, json.dumps(payload, indent=2).encode("utf-8"))


@app.command("import-topics")
def import_topics(manual_file: Path | None = typer.Option(None, exists=True)) -> None:
    result = fetch_topics(manual_file)
    destination = _write_json_cache("import_topics.json", result.__dict__)
    typer.echo(f"{result.message} Cached at {destination}")


@app.command("import-programme-stats")
def import_programme_stats(manual_file: Path | None = typer.Option(None, exists=True)) -> None:
    result = fetch_programme_stats(manual_file)
    destination = _write_json_cache("import_programme_stats.json", result.__dict__)
    typer.echo(f"{result.message} Cached at {destination}")


@app.command("import-cordis")
def import_cordis(manual_file: Path | None = typer.Option(None, exists=True)) -> None:
    result = fetch_cordis(manual_file)
    destination = _write_json_cache("import_cordis.json", result.__dict__)
    typer.echo(f"{result.message} Cached at {destination}")


@app.command("import-fts")
def import_fts(manual_file: Path | None = typer.Option(None, exists=True)) -> None:
    result = fetch_fts(manual_file)
    destination = _write_json_cache("import_fts.json", result.__dict__)
    typer.echo(f"{result.message} Cached at {destination}")


@app.command("build-embeddings")
def build_embeddings() -> None:
    dataset = load_demo_dataset()
    payload = {
        "topics": [{"id": topic["id"], "keywords": topic["keywords"]} for topic in dataset["topics"]],
        "projects": [{"id": project["id"], "topicReferences": project["topicReferences"]} for project in dataset["projects"]],
        "note": "Demo mode uses deterministic hash embeddings. Install optional sentence-transformers extras for richer embeddings in live mode.",
    }
    destination = _write_json_cache("embedding_manifest.json", payload)
    typer.echo(f"Embedding manifest generated at {destination}")


@app.command("build-graph")
def build_graph() -> None:
    payload = {
        "centrality": engine.network_centrality,
        "edgeCount": engine.graph.number_of_edges(),
        "nodeCount": engine.graph.number_of_nodes(),
    }
    destination = _write_json_cache("collaboration_graph.json", payload)
    typer.echo(f"Collaboration graph summary generated at {destination}")


@app.command("refresh-all")
def refresh_all() -> None:
    commands = [
        ("import-topics", lambda: fetch_topics()),
        ("import-programme-stats", lambda: fetch_programme_stats()),
        ("import-cordis", lambda: fetch_cordis()),
        ("import-fts", lambda: fetch_fts()),
    ]
    failures: list[str] = []
    for name, command in commands:
        try:
            result = command()
            _write_json_cache(f"{name}.json", result.__dict__)
            typer.echo(f"{name}: {result.message}")
        except Exception as exc:  # pragma: no cover - defensive logging
            failures.append(f"{name}: {exc}")
    build_embeddings()
    build_graph()
    if failures:
        typer.echo("Refresh completed with partial failures:")
        for failure in failures:
            typer.echo(f" - {failure}")
        raise typer.Exit(code=1)
    typer.echo("Refresh completed successfully.")


@app.command("validate")
def validate(split_year: int = 2024, k: int = 3) -> None:
    report = engine.validate(split_year=split_year, k=k)
    destination = _write_json_cache("validation_report.json", report)
    typer.echo(json.dumps(report, indent=2))
    typer.echo(f"Saved validation report to {destination}")

