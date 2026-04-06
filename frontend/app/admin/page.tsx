import { PageShell } from "@/components/page-shell";
import { AdminWorkspace } from "@/components/admin-workspace";

export default function AdminPage() {
  return (
    <PageShell title="Admin / Data" eyebrow="Data source operations and settings">
      <AdminWorkspace />
    </PageShell>
  );
}

