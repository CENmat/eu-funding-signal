import Link from "next/link";

const links = [
  { href: "/", label: "Search" },
  { href: "/results/", label: "Results" },
  { href: "/scenario/", label: "Scenario" },
  { href: "/admin/", label: "Admin / Data" },
];

export function PageShell({
  children,
  title,
  eyebrow,
}: {
  children: React.ReactNode;
  title?: string;
  eyebrow?: string;
}) {
  return (
    <div className="min-h-screen bg-[var(--page-bg)] text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-8 rounded-[28px] border border-slate-200 bg-white/90 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-700">
                {eyebrow ?? "Explainable EU grant intelligence"}
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                {title ?? "EU Funding Signal"}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Rank current EU opportunities, estimate public-data probability bands when a public
                baseline exists, and make consortium decisions with an evidence trail.
              </p>
            </div>
            <nav className="flex flex-wrap gap-2">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}

