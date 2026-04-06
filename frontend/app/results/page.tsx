import { Suspense } from "react";
import { PageShell } from "@/components/page-shell";
import { ResultsWorkspace } from "@/components/results-workspace";

export default function ResultsPage() {
  return (
    <PageShell title="Ranked opportunities" eyebrow="Topic, coordinator, and consortium ranking">
      <Suspense fallback={<div className="rounded-[32px] border border-slate-200 bg-white p-8 text-sm text-slate-600 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">Loading ranked opportunities...</div>}>
        <ResultsWorkspace />
      </Suspense>
    </PageShell>
  );
}
