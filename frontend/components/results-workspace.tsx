"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { loadDemoDataset, loadSearchResults } from "@/lib/api";
import type { CandidatePartner, SearchResponse } from "@/lib/types";
import { CaveatBanner } from "@/components/caveat-banner";
import { OpportunityCard } from "@/components/opportunity-card";

const STORAGE_KEYS = {
  filters: "efs:filters:v2",
  candidates: "efs:candidates:v2",
};

function formatFilterLabel(key: string, value: unknown) {
  if (key === "deadlineWindowDays") {
    const numeric = Number(value);
    const label = Number.isFinite(numeric) && numeric === 0
      ? "Due today only"
      : `Within ${String(value)} days`;
    return `Deadline: ${label}`;
  }

  return `${key}: ${String(value)}`;
}

export function ResultsWorkspace() {
  const dataset = loadDemoDataset();
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

      <CaveatBanner text={dataset.meta.caveat} />

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
