"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  BarChart,
  Bar,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SearchResult } from "@/lib/types";
import { formatCurrency, formatDate, formatPercent } from "@/lib/format";

function ProbabilityChip({ result }: { result: SearchResult }) {
  if (result.probability.mode === "public_probability") {
    return (
      <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
        <p className="font-semibold">Public-data probability estimate</p>
        <p className="mt-1">
          {formatPercent(result.probability.p10)} to {formatPercent(result.probability.p90)}
        </p>
        <p className="text-xs text-emerald-800">
          Median {formatPercent(result.probability.median)} | Baseline{" "}
          {formatPercent(result.probability.baseline)}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
      <p className="font-semibold">Relative win-likelihood index</p>
      <p className="mt-1 text-lg font-semibold">{result.probability.index.toFixed(1)} / 100</p>
      <p className="text-xs text-sky-800">No official public success-rate baseline available</p>
    </div>
  );
}

function ScoreBadge({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm">
      <span className="font-medium text-slate-500">{label}</span>{" "}
      <span className="font-semibold text-slate-900">{value.toFixed(1)}</span>
    </div>
  );
}

export function OpportunityCard({ result }: { result: SearchResult }) {
  const searchParams = useSearchParams();
  const query = searchParams.get("q");
  const chartData = [
    { label: "Opportunity", score: result.opportunityScore },
    { label: "Coordinator", score: result.coordinatorScore },
    { label: "Consortium", score: result.consortiumScore },
    { label: "Coverage", score: result.coverageScore },
  ];

  return (
    <article className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white">
              Rank {result.rank}
            </span>
            <span className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
              {result.topic.programme}
            </span>
            <span className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
              {result.topic.actionType}
            </span>
          </div>
          <h3 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">
            <Link
              href={`/topic/?id=${encodeURIComponent(result.topic.id)}${query ? `&q=${encodeURIComponent(query)}` : ""}`}
              className="hover:text-teal-800"
            >
              {result.topic.title}
            </Link>
          </h3>
          <p className="mt-3 text-sm leading-6 text-slate-600">{result.topic.description}</p>

          <dl className="mt-5 grid gap-3 text-sm text-slate-700 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <dt className="text-slate-500">Call / topic IDs</dt>
              <dd className="mt-1 font-semibold text-slate-950">
                {result.topic.callId}
                <br />
                {result.topic.topicId}
              </dd>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <dt className="text-slate-500">Deadline</dt>
              <dd className="mt-1 font-semibold text-slate-950">{formatDate(result.topic.deadline)}</dd>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <dt className="text-slate-500">Indicative budget</dt>
              <dd className="mt-1 font-semibold text-slate-950">
                {formatCurrency(result.topic.indicativeBudgetEur)}
              </dd>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <dt className="text-slate-500">Confidence</dt>
              <dd className="mt-1 font-semibold text-slate-950">{result.probability.confidenceLabel}</dd>
            </div>
          </dl>
        </div>
        <div className="w-full max-w-sm space-y-4">
          <ProbabilityChip result={result} />
          <div className="flex flex-wrap gap-2">
            <ScoreBadge label="Topic fit" value={result.opportunityScore} />
            <ScoreBadge label="Coordinator" value={result.coordinatorScore} />
            <ScoreBadge label="Consortium" value={result.consortiumScore} />
            <ScoreBadge label="Final" value={result.finalScore} />
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="space-y-5">
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-600">
              Coordinator recommendations
            </h4>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {result.recommendedCoordinators.slice(0, 4).map((coordinator) => (
                <Link
                  key={coordinator.organisationId}
                  href={`/organisation/?id=${encodeURIComponent(coordinator.organisationId)}${query ? `&q=${encodeURIComponent(query)}` : ""}`}
                  className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-teal-300 hover:bg-teal-50"
                >
                  <p className="font-semibold text-slate-950">{coordinator.organisationName}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {coordinator.country} | Score {coordinator.score.toFixed(1)}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-slate-500">{coordinator.rationale[0]}</p>
                </Link>
              ))}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-600">
                Coordinator countries
              </h4>
              <p className="mt-3 text-sm leading-6 text-slate-700">
                {result.recommendedCountries.join(", ")}
              </p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-600">
                Country mix
              </h4>
              <p className="mt-3 text-sm leading-6 text-slate-700">
                {result.consortiumCountryMix.join(", ")}
              </p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-600">
                Role mix
              </h4>
              <p className="mt-3 text-sm leading-6 text-slate-700">
                {result.suggestedRoles.join(", ")}
              </p>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-600">
              Top analogous funded projects
            </h4>
            <div className="mt-4 space-y-3">
              {result.similarProjects.map((project) => (
                <div key={project.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-slate-950">{project.title}</p>
                    <a
                      href={project.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700"
                    >
                      Source
                    </a>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{project.objective}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="space-y-5">
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-600">
              Score anatomy
            </h4>
            <div className="mt-4 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <XAxis dataKey="label" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} width={30} />
                  <Tooltip />
                  <Bar dataKey="score" fill="#0f766e" radius={[12, 12, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-600">
              Next-step plan
            </h4>
            <ul className="mt-4 space-y-2 text-sm leading-6 text-slate-700">
              {result.nextSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ul>
          </div>

          <details className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <summary className="cursor-pointer text-sm font-semibold uppercase tracking-[0.2em] text-slate-600">
              Explain score
            </summary>
            <div className="mt-5 space-y-5 text-sm leading-6 text-slate-700">
              <div>
                <p className="font-semibold text-slate-900">Formula</p>
                <p className="mt-1">{result.explainFormula}</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="font-semibold text-slate-900">Opportunity inputs</p>
                  <p>Lexical {result.scoreBreakdown.opportunity.lexical}</p>
                  <p>Semantic {result.scoreBreakdown.opportunity.semantic}</p>
                  <p>Analog alignment {result.scoreBreakdown.opportunity.analogAlignment}</p>
                  <p>Action type fit {result.scoreBreakdown.opportunity.actionTypeFit}</p>
                  <p>TRL fit {result.scoreBreakdown.opportunity.trlFit}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="font-semibold text-slate-900">Coordinator inputs</p>
                  <p>Topic coordinations {result.scoreBreakdown.coordinator.topicCoordinations}</p>
                  <p>Programme coordinations {result.scoreBreakdown.coordinator.programmeCoordinations}</p>
                  <p>Recency {result.scoreBreakdown.coordinator.recency}</p>
                  <p>Funding experience {result.scoreBreakdown.coordinator.fundingExperience}</p>
                  <p>Network centrality {result.scoreBreakdown.coordinator.networkCentrality}</p>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="font-semibold text-slate-900">Country evidence summary</p>
                <p className="mt-1">{result.countryEvidenceSummary}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="font-semibold text-slate-900">Evidence trail</p>
                <div className="mt-3 space-y-2">
                  {result.supportingEvidence.map((item) => (
                    <a
                      key={`${item.label}-${item.url}`}
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block rounded-2xl border border-slate-200 px-4 py-3 transition hover:border-teal-300 hover:bg-teal-50"
                    >
                      <p className="font-semibold text-slate-950">{item.label}</p>
                      <p className="mt-1 text-sm text-slate-600">{item.note}</p>
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </details>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl border border-rose-200 bg-rose-50 p-5">
              <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-rose-800">
                Red flags
              </h4>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-rose-900">
                {result.redFlags.length > 0 ? result.redFlags.map((item) => <li key={item}>{item}</li>) : <li>No material red flags detected from the public-data view.</li>}
              </ul>
            </div>
            <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5">
              <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-800">
                Reasons to pursue
              </h4>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-emerald-950">
                {result.reasonsToPursue.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5">
              <h4 className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-800">
                Improvement levers
              </h4>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-amber-950">
                {result.improvementLevers.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </div>
    </article>
  );
}
