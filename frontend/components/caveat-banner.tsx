export function CaveatBanner({ text }: { text: string }) {
  return (
    <div className="rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]">
      <p className="font-semibold text-amber-900">Decision-support caveat</p>
      <p className="mt-1">{text}</p>
    </div>
  );
}

