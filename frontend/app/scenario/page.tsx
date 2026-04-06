import { Suspense } from "react";
import { PageShell } from "@/components/page-shell";
import { ScenarioWorkspace } from "@/components/scenario-workspace";

export default function ScenarioPage() {
  return (
    <PageShell title="Scenario compare" eyebrow="Coordinator simulation">
      <Suspense fallback={<div className="rounded-[32px] border border-slate-200 bg-white p-8 text-sm text-slate-600 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">Loading scenario compare...</div>}>
        <ScenarioWorkspace />
      </Suspense>
    </PageShell>
  );
}
