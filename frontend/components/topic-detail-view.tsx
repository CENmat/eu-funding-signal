"use client";

import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  BarChart,
  Bar,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { loadDemoDataset, loadTopicDetail } from "@/lib/api";
import { formatCurrency, formatDate, formatDeadlineStatus } from "@/lib/format";
import { CaveatBanner } from "@/components/caveat-banner";
import type { TopicDetail } from "@/lib/types";

function exportJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function exportCsv(rows: Array<Record<string, string | number>>, filename: string) {
  const headers = Object.keys(rows[0] ?? {});
  const body = rows.map((row) => headers.map((header) => JSON.stringify(row[header] ?? "")).join(","));
  const csv = [headers.join(","), ...body].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function TopicDetailView({ topicId }: { topicId: string }) {
  const searchParams = useSearchParams();
  const dataset = loadDemoDataset();
  const resolvedTopicId = topicId || searchParams.get("id") || "";
  const query = searchParams.get("q") ?? undefined;
  const topic = useQuery<TopicDetail | undefined>({
    queryKey: ["topic-detail", resolvedTopicId, query],
    queryFn: () => loadTopicDetail(resolvedTopicId, query),
    enabled: Boolean(resolvedTopicId),
  });

  if (topic.isLoading) {
    return (
      <section className="rounded-[32px] border border-slate-200 bg-white p-10 text-sm text-slate-600 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
        Loading topic detail...
      </section>
    );
  }

  if (!topic.data) {
    return (
      <section className="rounded-[32px] border border-dashed border-slate-300 bg-white p-10 text-sm leading-6 text-slate-600 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
        No topic detail was found for this ID. Reopen the topic from the ranked results so the live
        evidence can be rebuilt for the current query.
      </section>
    );
  }

  const detail = topic.data;

  return (
    <div className="space-y-6">
      <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-4xl">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-teal-700">
              Topic detail
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
              {detail.topic.title}
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">{detail.topic.description}</p>
            <a
              href={detail.topic.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex text-sm font-semibold text-teal-700 hover:text-teal-800"
            >
              Open official topic page
            </a>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => exportJson(detail, `${detail.topic.id}.json`)}
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800"
            >
              Export JSON
            </button>
            <button
              type="button"
              onClick={() =>
                exportCsv(
                  detail.similarProjects.map((project) => ({
                    title: project.title,
                    programme: project.programme,
                    actionType: project.actionType,
                    contributionEur: project.euContributionEur,
                  })),
                  `${detail.topic.id}-analogs.csv`,
                )
              }
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800"
            >
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Export PDF
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
            <p className="text-slate-500">Programme</p>
            <p className="mt-1 font-semibold text-slate-950">{detail.topic.programme}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
            <p className="text-slate-500">Action type</p>
            <p className="mt-1 font-semibold text-slate-950">{detail.topic.actionType}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
            <p className="text-slate-500">Deadline</p>
            <p className="mt-1 font-semibold text-slate-950">{formatDate(detail.topic.deadline)}</p>
            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              {formatDeadlineStatus(detail.topic.deadline)}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
            <p className="text-slate-500">Budget</p>
            <p className="mt-1 font-semibold text-slate-950">
              {formatCurrency(detail.topic.indicativeBudgetEur)}
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
            <h3 className="text-lg font-semibold text-slate-950">Historical coordinators</h3>
            <div className="mt-4 space-y-3">
              {detail.topHistoricalCoordinators.slice(0, 6).map((coordinator) => (
                <div key={coordinator.organisationId} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <Link
                      href={`/organisation/?id=${encodeURIComponent(coordinator.organisationId)}${query ? `&q=${encodeURIComponent(query)}` : ""}`}
                      className="font-semibold text-slate-950 hover:text-teal-800"
                    >
                      {coordinator.organisationName}
                    </Link>
                    <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-white">
                      {coordinator.score.toFixed(1)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {coordinator.rationale.join(" ")}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
            <h3 className="text-lg font-semibold text-slate-950">Top 10 analogous funded projects</h3>
            <div className="mt-4 space-y-3">
              {detail.similarProjects.map((project) => (
                <div key={project.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
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
        </div>

        <div className="space-y-6">
          <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
            <h3 className="text-lg font-semibold text-slate-950">Coordinator-country distribution</h3>
            <div className="mt-4 h-60">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={detail.coordinatorCountryDistribution}>
                  <XAxis dataKey="country" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} width={30} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#0f766e" radius={[10, 10, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
            <h3 className="text-lg font-semibold text-slate-950">Common partner role patterns</h3>
            <div className="mt-4 h-60">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={detail.commonRolePatterns.slice(0, 6)}>
                  <XAxis type="number" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis dataKey="role" type="category" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} width={100} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#1d4ed8" radius={[0, 10, 10, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
            <h3 className="text-lg font-semibold text-slate-950">Simulation panel</h3>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Use the dedicated scenario compare workflow to test which candidate partner should lead
              and how country mix or role gaps change the signal.
            </p>
            <Link
              href={`/scenario/?q=${encodeURIComponent(query ?? detail.topic.title)}`}
              className="mt-4 inline-flex rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Open scenario compare
            </Link>
          </div>
        </div>
      </section>

      <CaveatBanner text={dataset.meta.caveat} />
    </div>
  );
}
