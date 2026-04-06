import { Suspense } from "react";
import demoDataset from "@/lib/demo-dataset.json";
import { PageShell } from "@/components/page-shell";
import { TopicDetailView } from "@/components/topic-detail-view";

export function generateStaticParams() {
  return (demoDataset.topics as Array<{ id: string }>).map((topic) => ({
    topicId: topic.id,
  }));
}

export default async function TopicPage({
  params,
}: {
  params: Promise<{ topicId: string }>;
}) {
  const { topicId } = await params;
  return (
    <PageShell title="Topic detail" eyebrow="Full explanation and analogue evidence">
      <Suspense fallback={<div className="rounded-[32px] border border-slate-200 bg-white p-8 text-sm text-slate-600 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">Loading topic detail...</div>}>
        <TopicDetailView topicId={topicId} />
      </Suspense>
    </PageShell>
  );
}
