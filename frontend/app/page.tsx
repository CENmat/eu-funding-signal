import { PageShell } from "@/components/page-shell";
import { SearchWorkspace } from "@/components/search-workspace";

export default function HomePage() {
  return (
    <PageShell title="EU Funding Signal" eyebrow="Public-data grant intelligence">
      <SearchWorkspace />
    </PageShell>
  );
}

