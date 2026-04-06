"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { loadScenarioComparison } from "@/lib/api";
import type { CandidatePartner, ScenarioComparison } from "@/lib/types";
import { CaveatBanner } from "@/components/caveat-banner";
import { loadDemoDataset } from "@/lib/api";

const STORAGE_KEY = "efs:candidates";

export function ScenarioWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = searchParams.get("q") ?? "interposer";
  const [candidates] = useState<CandidatePartner[]>(() => {
    if (typeof window === "undefined") {
      return [];
    }
    const stored = sessionStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  });
  const dataset = loadDemoDataset();

  const comparison = useQuery<ScenarioComparison>({
    queryKey: ["scenario", query, candidates],
    queryFn: () => loadScenarioComparison(query, candidates),
    enabled: candidates.length > 0,
  });

  return (
    <div className="space-y-6">
      <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-teal-700">
              Coordinator simulation
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
              Compare candidate coordinators
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Query: <span className="font-semibold text-slate-900">{query}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="rounded-full border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800"
          >
            Edit candidate consortium
          </button>
        </div>
      </section>

      {comparison.data ? (
        <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
            <h3 className="text-lg font-semibold text-slate-950">Best-fit summary</h3>
            <dl className="mt-5 space-y-4 text-sm text-slate-700">
              <div>
                <dt className="font-medium text-slate-500">Recommended coordinator</dt>
                <dd className="mt-1 text-base font-semibold text-slate-950">
                  {comparison.data.bestCoordinatorName ?? "No strong historical match"}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500">Recommended country pattern</dt>
                <dd className="mt-1">{comparison.data.recommendedCountryPattern.join(", ")}</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500">Missing roles</dt>
                <dd className="mt-1">
                  {comparison.data.missingRoles.length > 0
                    ? comparison.data.missingRoles.join(", ")
                    : "No major role gaps detected from the supplied partner set."}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
            <h3 className="text-lg font-semibold text-slate-950">Ranked candidates</h3>
            <div className="mt-4 space-y-3">
              {comparison.data.rankedCandidates.map((candidate) => (
                <article
                  key={`${candidate.name}-${candidate.score}`}
                  className="rounded-3xl border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h4 className="text-base font-semibold text-slate-950">{candidate.name}</h4>
                      <p className="mt-1 text-sm text-slate-600">
                        Score {candidate.score.toFixed(1)} | Delta vs best {candidate.deltaVsBest.toFixed(1)}
                      </p>
                    </div>
                    <div className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
                      {candidate.score.toFixed(1)}
                    </div>
                  </div>
                  <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                    {candidate.rationale.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : (
        <section className="rounded-[32px] border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-600">
          Add candidate partners on the search page first, then reopen scenario compare.
        </section>
      )}

      <CaveatBanner text={dataset.meta.caveat} />
    </div>
  );
}
