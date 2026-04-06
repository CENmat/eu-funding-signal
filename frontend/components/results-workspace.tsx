"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { loadDemoDataset, loadSearchResults } from "@/lib/api";
import type { CandidatePartner, SearchResponse } from "@/lib/types";
import { CaveatBanner } from "@/components/caveat-banner";
import { OpportunityCard } from "@/components/opportunity-card";

const STORAGE_KEYS = {
  filters: "efs:filters",
  candidates: "efs:candidates",
};

export function ResultsWorkspace() {
  const dataset = loadDemoDataset();
  const searchParams = useSearchParams();
  const query = searchParams.get("q") ?? (process.env.NEXT_PUBLIC_DEFAULT_QUERY ?? "interposer");
  const [approvedExpansions, setApprovedExpansions] = useState<string[] | null>(null);
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
    queryKey: ["search-results", query, approvedExpansions, candidates, filters],
    queryFn: () =>
      loadSearchResults({
        query,
        approvedExpansions: approvedExpansions ?? undefined,
        candidatePartners: candidates,
        filters,
      }),
  });
  const selectedExpansions = approvedExpansions ?? search.data?.acceptedExpansions ?? [];

  return (
    <div className="space-y-6">
      <section className="grid gap-6 lg:grid-cols-[1fr_0.7fr]">
        <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-teal-700">
            Search summary
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{query}</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            {search.data?.results.length ?? 0} ranked opportunities with explainable scoring, coordinator
            recommendations, and next-step plans.
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
                    {key}: {String(value)}
                  </span>
                ))}
            </div>
          ) : null}
        </div>

        <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-600">
            Query expansion review
          </p>
          <div className="mt-4 space-y-3">
            {search.data?.suggestedExpansions.map((item) => {
              const selected = selectedExpansions.includes(item.term);
              return (
                <label
                  key={item.term}
                  className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700"
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() =>
                      setApprovedExpansions((current) => {
                        const base = current ?? search.data?.acceptedExpansions ?? [];
                        return base.includes(item.term)
                          ? base.filter((value) => value !== item.term)
                          : [...base, item.term];
                      })
                    }
                    className="mt-1"
                  />
                  <div>
                    <p className="font-semibold text-slate-950">{item.term}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{item.reason}</p>
                  </div>
                </label>
              );
            })}
          </div>
        </section>
      </section>

      <CaveatBanner text={dataset.meta.caveat} />

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
          No current open topics matched this search under the active filters. If you want historical
          analogues, go back and enable `Include recent closed topics for analogue evidence`.
        </section>
      ) : null}

      {search.data?.results.map((result) => (
        <OpportunityCard key={result.topic.id} result={result} />
      ))}
    </div>
  );
}
