import { Suspense } from "react";
import { PageShell } from "@/components/page-shell";
import { OrganisationDetailView } from "@/components/organisation-detail-view";

export default function StaticOrganisationPage() {
  return (
    <PageShell title="Organisation detail" eyebrow="Coordinator profile and network evidence">
      <Suspense fallback={<div className="rounded-[32px] border border-slate-200 bg-white p-8 text-sm text-slate-600 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">Loading organisation profile...</div>}>
        <OrganisationDetailView organisationId="" />
      </Suspense>
    </PageShell>
  );
}
