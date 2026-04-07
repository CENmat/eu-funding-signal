"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { clearSearchCaches, loadSearchResults } from "@/lib/api";
import type { CandidatePartner, SearchDiagnostics, SearchResponse } from "@/lib/types";
import { CaveatBanner } from "@/components/caveat-banner";
import { OpportunityCard } from "@/components/opportunity-card";

const CAVEAT_TEXT = "This estimate is based on public funded-project data, public programme statistics, and historical consortium patterns. It does not include rejected proposals or private evaluator feedback. Treat this as decision support, not a guaranteed chance of success.";
const STORAGE_KEYS = {
  filters: "efs:filters:v4",
  candidates: "efs:candidates:v2",
};

function formatFilterLabel(key: string, value: unknown) {
  if (key === "queryOperator") {
    return String(value) === "and" ? "Query logic: Match all terms (AND)" : "Query logic: Match any term (OR)";
  }
  if (key === "deadlineWindowDays") {
    const numeric = Number(value);
    const label = Number.isFinite(numeric) && numeric === 0
      ? "Any future deadline"
      : `At least ${String(value)} days away`;
    return `Deadline: ${label}`;
  }

  return `${key}: ${String(value)}`;
}

function formatTraceValue(value: string | string[] | number | boolean | undefined) {
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(", ") : "None";
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  return value ?? "Unknown";
}

function SearchTrace({ diagnostics }: { diagnostics: SearchDiagnostics }) {
  const traceRows: Array<{ label: string; value: string | number | boolean | string[] | undefined }> = [
    { label: "Retrieval source", value: diagnostics.retrievalSource },
    { label: "Query logic", value: diagnostics.queryOperator === "and" ? "Match all terms (AND)" : "Match any terms (OR)" },
    { label: "Query groups", value: diagnostics.queryGroups },
    { label: "Funding & Tenders variants", value: diagnostics.searchVariants },
    { label: "Current-boost variants", value: diagnostics.currentBoostVariants },
    { label: "Fallback variants", value: diagnostics.fallbackVariants },
    { label: "Raw Funding & Tenders hits", value: diagnostics.sediaRawHitCount },
    { label: "Grant topic records after normalization", value: diagnostics.normalizedGrantTopicCount },
    { label: "Current open/forthcoming topics", value: diagnostics.currentTopicCount },
    { label: "Ranked current results", value: diagnostics.currentResultCount },
    { label: "Closed analogue candidates", value: diagnostics.closedFallbackCount },
    { label: "CORDIS analog projects", value: diagnostics.cordisProjectCount },
    { label: "Closed fallback used", value: diagnostics.usedClosedFallback },
    { label: "Response cache", value: diagnostics.responseCache },
    { label: "Local search-result JSON used", value: diagnostics.localResultJsonUsed },
  ];

  return (
    <details className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
      <summary className="cursor-pointer text-sm font-semibold uppercase tracking-[0.2em] text-slate-600">
        Search Trace
      </summary>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {traceRows.map((row) => (
          <div key={row.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
            <p className="text-slate-500">{row.label}</p>
            <p className="mt-1 font-medium leading-6 text-slate-900">{formatTraceValue(row.value)}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
        <p>{diagnostics.localSeedUsageNote}</p>
        <p>{diagnostics.cacheScopeNote}</p>
      </div>
    </details>
  );
}

export function ResultsWorkspace() {
  const searchParams = useSearchParams();
  const query = (searchParams.get("q") ?? "").trim();
  const [candidates] = useState<CandidatePartner[]>(() => {
    if (typeof window === "undefined") {
      return [];
    }
    const stored = sessionStorage.getItem(STORAGE_KEYS.candidates);
    return stored ? JSON.parse(stored) : [];
  });
  const [filters] = useState<Record<string, unknown>>(() => {
    if (typeof window === "undefined") {
      return {};
    }
    const stored = sessionStorage.getItem(STORAGE_KEYS.filters);
    return stored ? JSON.parse(stored) : {};
  });

  const search = useQuery<SearchResponse>({
    queryKey: ["search-results", query, candidates, filters],
    enabled: Boolean(query),
    queryFn: () =>
      loadSearchResults({
        query,
        candidatePartners: candidates,
        filters,
      }),
  });

  return (
    <div className="space-y-6">
      <section>
        <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-teal-700">
            Search summary
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
            {query || "No search entered"}
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            {query
              ? `${search.data?.results.length ?? 0} ranked ${
                  search.data?.resultMode === "closed_fallback" ? "analogue opportunities" : "opportunities"
                } with explainable scoring, coordinator recommendations, and next-step plans.`
              : "Enter a query on the search page to run a live ranking."}
          </p>
          {query ? (
            <button
              type="button"
              onClick={async () => {
                clearSearchCaches();
                await search.refetch();
              }}
              className="mt-4 rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800"
            >
              Refresh live sources
            </button>
          ) : null}
          {Object.keys(filters).length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {Object.entries(filters)
                .filter(([, value]) => value !== "" && value !== false)
                .map(([key, value]) => (
                  <span
                    key={key}
                    className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600"
                  >
                    {formatFilterLabel(key, value)}
                  </span>
                ))}
            </div>
          ) : null}
        </div>
      </section>

      <CaveatBanner text={CAVEAT_TEXT} />

      {search.data?.diagnostics ? <SearchTrace diagnostics={search.data.diagnostics} /> : null}

      {!query ? (
        <section className="rounded-[32px] border border-amber-200 bg-amber-50 p-8 text-sm leading-6 text-amber-950 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
          No search query was provided. Go back to the search page and enter a term first.
        </section>
      ) : null}

      {search.isLoading ? (
        <section className="rounded-[32px] border border-slate-200 bg-white p-10 text-sm text-slate-600 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
          Building the ranking, coordinator suggestions, and evidence trail...
        </section>
      ) : null}

      {search.isError ? (
        <section className="rounded-[32px] border border-rose-200 bg-rose-50 p-8 text-sm leading-6 text-rose-900 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
          The live public-data lookup failed for this search. Please retry in a moment. If the official
          source stays unavailable, the issue is upstream rather than your input.
          <p className="mt-3 font-mono text-xs leading-5 text-rose-950">
            {search.error instanceof Error ? search.error.message : String(search.error)}
          </p>
        </section>
      ) : null}

      {search.data && !search.isLoading && !search.isError && search.data.results.length === 0 ? (
        <section className="rounded-[32px] border border-amber-200 bg-amber-50 p-8 text-sm leading-6 text-amber-950 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
          No current open grant topics matched this search under the active filters. Tender and
          procurement notices are excluded. If you want historical analogues, go back and enable
          `Include recent closed topics for analogue evidence`.
        </section>
      ) : null}

      {search.data?.resultMode === "closed_fallback" && search.data.results.length > 0 ? (
        <section className="rounded-[32px] border border-amber-200 bg-amber-50 p-6 text-sm leading-6 text-amber-950 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
          {search.data.resultNote}
        </section>
      ) : null}

      {query && search.data?.results.map((result) => (
        <OpportunityCard key={result.topic.id} result={result} />
      ))}
    </div>
  );
}
