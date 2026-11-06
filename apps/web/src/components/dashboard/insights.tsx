"use client";

import Link from "next/link";
import { AlertTriangle, X } from "lucide-react";
import type { Analytics } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { fmtDate } from "@/lib/format";

const PERIODS = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "1 year" },
];

/** Quick periods, a custom from/to range, and an optional division picker. They drive every number below. */
export function FilterBar({ days, onDays, from, to, onRange, division, onDivision, divisions }: {
  days: number; onDays: (d: number) => void; from: string; to: string; onRange: (from: string, to: string) => void;
  division: string; onDivision: (v: string) => void; divisions: { id: number; name: string }[];
}) {
  const custom = !!(from || to);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div role="radiogroup" aria-label="Period" className="inline-flex rounded-xl border border-[var(--app-line)] bg-[var(--app-surface)] p-1">
        {PERIODS.map((p) => (
          <button key={p.days} role="radio" aria-checked={!custom && days === p.days} onClick={() => { onRange("", ""); onDays(p.days); }}
            className={cn("rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors", !custom && days === p.days ? "bg-[var(--app-brand)] text-white" : "text-[var(--app-ink-3)] hover:text-[var(--app-ink)]")}>
            {p.label}
          </button>
        ))}
      </div>
      <div className={cn("flex items-center gap-1.5 rounded-xl border bg-white px-2.5 py-1", custom ? "border-[var(--app-brand)]" : "border-[var(--app-line)]")}>
        <label className="flex items-center gap-1.5 text-xs font-semibold text-[var(--app-ink-3)]">From
          <input type="date" value={from} max={to || undefined} onChange={(e) => onRange(e.target.value, to)} aria-label="From date" className="h-8 rounded-lg border-0 bg-transparent text-sm text-[var(--app-ink)] focus:outline-none" />
        </label>
        <span className="text-[var(--app-ink-3)]">→</span>
        <label className="flex items-center gap-1.5 text-xs font-semibold text-[var(--app-ink-3)]">To
          <input type="date" value={to} min={from || undefined} onChange={(e) => onRange(from, e.target.value)} aria-label="To date" className="h-8 rounded-lg border-0 bg-transparent text-sm text-[var(--app-ink)] focus:outline-none" />
        </label>
        {custom ? <button onClick={() => onRange("", "")} aria-label="Clear dates" className="rounded-md p-1 text-[var(--app-ink-3)] hover:bg-[var(--app-surface-sunk)]"><X className="h-3.5 w-3.5" /></button> : null}
      </div>
      {divisions.length > 1 ? (
        <select aria-label="Division" value={division} onChange={(e) => onDivision(e.target.value)}
          className="h-10 rounded-xl border border-[var(--app-line)] bg-white px-3 text-sm text-[var(--app-ink)]">
          <option value="">All divisions</option>
          {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      ) : null}
    </div>
  );
}

export function Funnel({ data }: { data: Analytics["funnel"] }) {
  const top = Math.max(1, data[0]?.value ?? 1);
  return (
    <ul className="space-y-4 p-5" aria-label="Enquiry funnel">
      {data.map((s, i) => {
        const prev = i === 0 ? null : data[i - 1].value;
        const pct = prev ? Math.round((s.value / prev) * 100) : null;
        return (
          <li key={s.label}>
            <div className="mb-1.5 flex items-baseline justify-between text-sm">
              <span className="font-semibold text-[var(--app-ink)]">{s.label}</span>
              <span className="tnum text-[var(--app-ink-2)]">{s.value}{pct !== null ? <span className="ml-2 text-xs text-[var(--app-ink-3)]">{pct}% of previous</span> : null}</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-[var(--app-surface-sunk)]">
              <div className="h-full rounded-full bg-[var(--app-brand)]" style={{ width: `${(s.value / top) * 100}%`, opacity: 1 - i * 0.18 }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function TopClients({ data }: { data: Analytics["topClients"] }) {
  if (!data.length) return <p className="p-5 text-sm text-[var(--app-ink-3)]">No clients in this period.</p>;
  return (
    <ul className="divide-y divide-[var(--app-line-soft)]">
      {data.map((c, i) => (
        <li key={c.name} className="flex items-center gap-3 px-5 py-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--app-brand-tint)] text-xs font-bold text-[var(--app-brand)]">{i + 1}</span>
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-[var(--app-ink)]">{c.name}</p><p className="text-[11px] text-[var(--app-ink-3)]">Last enquiry {fmtDate(c.lastDate)}</p></div>
          <span className="tnum text-sm font-bold text-[var(--app-ink)]">{c.count}</span>
        </li>
      ))}
    </ul>
  );
}

export function TeamActivity({ data }: { data: Analytics["team"] }) {
  if (!data.length) return <p className="p-5 text-sm text-[var(--app-ink-3)]">No activity in this period.</p>;
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <ul className="space-y-3.5 p-5">
      {data.map((d) => (
        <li key={d.role + d.name}>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="font-semibold text-[var(--app-ink)]">{d.name} <span className="ml-1 rounded-full bg-[var(--app-surface-sunk)] px-2 py-0.5 text-[10px] font-bold text-[var(--app-ink-2)]">{d.role === "MARKETING" ? "logged" : "priced"}</span></span>
            <span className="tnum text-[var(--app-ink-2)]">{d.count}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[var(--app-surface-sunk)]"><div className={cn("h-full rounded-full", d.role === "MARKETING" ? "bg-[var(--app-brand)]" : "bg-[#1baf7a]")} style={{ width: `${(d.count / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

export function OldestWaiting({ o }: { o: Analytics["oldestWaiting"] }) {
  if (!o || o.days < 2) return null;
  return (
    <Link href={`/orders/${o.id}`} className="flex items-center gap-3 rounded-2xl border border-[var(--app-act-line)] bg-[var(--app-act-bg)] px-4 py-3 text-sm text-[var(--app-act-ink)] hover:opacity-90">
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
      <span><b>{o.orderNumber}</b> ({o.name}) has been waiting for pricing for {o.days} days.</span>
    </Link>
  );
}
