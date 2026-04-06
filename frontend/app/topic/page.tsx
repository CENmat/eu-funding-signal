import { Suspense } from "react";
import { PageShell } from "@/components/page-shell";
import { TopicDetailView } from "@/components/topic-detail-view";

export default function StaticTopicPage() {
  return (
    <PageShell title="Topic detail" eyebrow="Full explanation and analogue evidence">
      <Suspense fallback={<div className="rounded-[32px] border border-slate-200 bg-white p-8 text-sm text-slate-600 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">Loading topic detail...</div>}>
        <TopicDetailView topicId="" />
      </Suspense>
    </PageShell>
  );
}
