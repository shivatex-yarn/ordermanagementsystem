import type { Analytics } from "@/lib/analytics";

export function KpiStrip({ k }: { k: Analytics["kpis"] }) {
  const items = [
    { label: "Logged this month", value: String(k.loggedThisMonth) },
    { label: "Avg time to price", value: k.avgHoursToPrice === null ? "—" : k.avgHoursToPrice >= 48 ? `${Math.round(k.avgHoursToPrice / 24)} days` : `${k.avgHoursToPrice} hrs` },
    { label: "Client acceptance", value: k.acceptRate === null ? "—" : `${k.acceptRate}%` },
    { label: "Sample requests", value: k.sampleShare === null ? "—" : `${k.sampleShare}%` },
  ];
  return (
    <dl className="grid grid-cols-2 divide-x divide-y divide-[var(--app-line-soft)] sm:grid-cols-4 sm:divide-y-0">
      {items.map((i) => (
        <div key={i.label} className="px-5 py-4">
          <dt className="text-xs font-semibold text-[var(--app-ink-3)]">{i.label}</dt>
          <dd className="tnum mt-1 text-2xl font-extrabold tracking-tight text-[var(--app-ink)]">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}
