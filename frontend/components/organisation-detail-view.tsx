"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { loadDemoDataset, loadOrganisationDetail } from "@/lib/api";
import { formatCompactNumber, formatCurrency } from "@/lib/format";
import { CaveatBanner } from "@/components/caveat-banner";
import type { OrganisationDetail } from "@/lib/types";

export function OrganisationDetailView({ organisationId }: { organisationId: string }) {
  const searchParams = useSearchParams();
  const query = searchParams.get("q") ?? undefined;
  const resolvedOrganisationId = organisationId || searchParams.get("id") || "";
  const dataset = loadDemoDataset();
  const organisation = useQuery<OrganisationDetail | undefined>({
    queryKey: ["organisation-detail", resolvedOrganisationId, query],
    queryFn: () => loadOrganisationDetail(resolvedOrganisationId, query),
    enabled: Boolean(resolvedOrganisationId),
  });

  if (organisation.isLoading) {
    return (
      <section className="rounded-[32px] border border-slate-200 bg-white p-10 text-sm text-slate-600 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
        Loading organisation profile...
      </section>
    );
  }

  if (!organisation.data) {
    return (
      <section className="rounded-[32px] border border-dashed border-slate-300 bg-white p-10 text-sm leading-6 text-slate-600 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
        No organisation profile was found for this ID. Reopen the organisation from the ranked
        results so the live evidence can be rebuilt for the current query.
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-teal-700">
          Organisation detail
        </p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
          {organisation.data.organisation.name}
        </h2>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600">
          {organisation.data.organisation.description}
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
            <p className="text-slate-500">Country</p>
            <p className="mt-1 font-semibold text-slate-950">{organisation.data.organisation.country}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
            <p className="text-slate-500">Coordination count</p>
            <p className="mt-1 font-semibold text-slate-950">{organisation.data.pastCoordinationCount}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
            <p className="text-slate-500">Participation count</p>
            <p className="mt-1 font-semibold text-slate-950">{organisation.data.pastParticipationCount}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
            <p className="text-slate-500">Funding exposure</p>
            <p className="mt-1 font-semibold text-slate-950">
              {formatCurrency(organisation.data.totalKnownFundingExposureEur)}
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-6">
          <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
            <h3 className="text-lg font-semibold text-slate-950">Profile summary</h3>
            <dl className="mt-4 space-y-4 text-sm text-slate-700">
              <div>
                <dt className="font-medium text-slate-500">Organisation type</dt>
                <dd className="mt-1">{organisation.data.organisation.organisationType}</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500">Relevant programmes</dt>
                <dd className="mt-1">{organisation.data.relevantProgrammes.join(", ")}</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500">Network centrality</dt>
                <dd className="mt-1">{formatCompactNumber(organisation.data.networkCentrality * 100)} / 100</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500">Matched aliases</dt>
                <dd className="mt-1">
                  {organisation.data.matchedAliases.length > 0
                    ? organisation.data.matchedAliases.join(", ")
                    : "No alias records in the demo seed"}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
            <h3 className="text-lg font-semibold text-slate-950">Frequent collaborators</h3>
            <div className="mt-4 space-y-3">
              {organisation.data.frequentCollaborators.map((collaborator) => (
                <div key={collaborator.organisationId} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="font-semibold text-slate-950">{collaborator.organisationName}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {collaborator.count} repeated public collaboration edge(s)
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
            <h3 className="text-lg font-semibold text-slate-950">Relevant topics</h3>
            <div className="mt-4 space-y-3">
              {organisation.data.relevantTopics.map((topic) => (
                <Link
                  key={topic.id}
                  href={`/topic/?id=${encodeURIComponent(topic.id)}${query ? `&q=${encodeURIComponent(query)}` : ""}`}
                  className="block rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-teal-300 hover:bg-teal-50"
                >
                  <p className="font-semibold text-slate-950">{topic.title}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{topic.description}</p>
                </Link>
              ))}
            </div>
          </div>

          <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
            <h3 className="text-lg font-semibold text-slate-950">Evidence links</h3>
            <div className="mt-4 space-y-3">
              {organisation.data.evidence.map((item) => (
                <a
                  key={`${item.label}-${item.url}`}
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-teal-300 hover:bg-teal-50"
                >
                  <p className="font-semibold text-slate-950">{item.label}</p>
                  <p className="mt-1 text-sm text-slate-600">{item.note}</p>
                </a>
              ))}
            </div>
          </div>
        </div>
      </section>

      <CaveatBanner text={dataset.meta.caveat} />
    </div>
  );
}
