"use client";

import { useState } from "react";
import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ScrollText, Search, X } from "lucide-react";
import { api, fmtDateTime } from "@/lib/format";
import { roleLabel } from "@/lib/roles";
import { EmptyState, PageHeader, Panel, PanelSkeleton } from "@/components/ui/panel";
import { selectClass } from "@/components/ui/field";
import { cn } from "@/lib/utils";

type Log = { id: number; userId: number | null; userName: string; userRole: string | null; category: string; action: string; entityType: string | null; entityId: number | null; entityLabel: string | null; detail: string | null; ipAddress: string | null; createdAt: string };
type Data = { logs: Log[]; total: number; page: number; pageSize: number; people: { id: number; name: string; count: number }[] };

const CATEGORIES = [
  { key: "", label: "All activity" }, { key: "AUTH", label: "Sign-ins" }, { key: "ENQUIRY", label: "Enquiries" },
  { key: "TEAM", label: "Team" }, { key: "DIVISION", label: "Divisions" }, { key: "ACCESS", label: "Access requests" },
];
const TONE: Record<string, string> = {
  AUTH: "bg-[var(--app-surface-sunk)] text-[var(--app-ink-2)] border-[var(--app-line)]",
  ENQUIRY: "bg-[var(--app-brand-tint)] text-[var(--app-brand)] border-[var(--app-brand-line)]",
  TEAM: "bg-[var(--app-wait-bg)] text-[var(--app-wait-ink)] border-[var(--app-wait-line)]",
  DIVISION: "bg-[var(--app-done-bg)] text-[var(--app-done-ink)] border-[var(--app-done-line)]",
  ACCESS: "bg-[var(--app-act-bg)] text-[var(--app-act-ink)] border-[var(--app-act-line)]",
};
const pretty = (a: string) => a.toLowerCase().replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

export default function AuditPage() {
  const [q, setQ] = useState("");
  const [userId, setUserId] = useState("");
  const [category, setCategory] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const reset = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };

  const qs = new URLSearchParams({ page: String(page) });
  if (q.trim()) qs.set("q", q.trim());
  if (userId) qs.set("userId", userId);
  if (category) qs.set("category", category);
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  const { data, isLoading } = useQuery({ queryKey: ["audit", q, userId, category, from, to, page], queryFn: () => api<Data>(`/api/audit?${qs}`), placeholderData: keepPreviousData, staleTime: 10_000 });

  const filtered = !!(q.trim() || userId || category || from || to);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const first = data && data.total ? (page - 1) * data.pageSize + 1 : 0;
  const last = data ? Math.min(data.total, page * data.pageSize) : 0;

  return (
    <>
      <PageHeader title="Audit log" description="Everything each person did, and when. Only you can see this." />
      <Panel>
        <div className="space-y-3 border-b border-[var(--app-line-soft)] p-4">
          <div role="tablist" className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => (
              <button key={c.key} role="tab" aria-selected={category === c.key} onClick={() => reset(setCategory)(c.key)}
                className={cn("rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors", category === c.key ? "bg-[var(--app-brand)] text-white" : "bg-[var(--app-surface-sunk)] text-[var(--app-ink-2)] hover:bg-[var(--app-line-soft)]")}>{c.label}</button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[14rem] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--app-ink-3)]" aria-hidden />
              <input value={q} onChange={(e) => reset(setQ)(e.target.value)} placeholder="Search person, action, enquiry or detail" aria-label="Search audit log"
                className="h-10 w-full rounded-xl border border-[var(--app-line)] bg-[var(--app-surface-sunk)] pl-9 pr-3 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--app-brand)]/20" />
            </div>
            <select aria-label="Person" value={userId} onChange={(e) => reset(setUserId)(e.target.value)} className={cn(selectClass, "w-48")}>
              <option value="">Everyone</option>
              {data?.people.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.count})</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-[var(--app-ink-3)]">From <input type="date" value={from} max={to || undefined} onChange={(e) => reset(setFrom)(e.target.value)} className="h-10 rounded-xl border border-[var(--app-line)] bg-white px-2.5 text-sm text-[var(--app-ink)]" /></label>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-[var(--app-ink-3)]">To <input type="date" value={to} min={from || undefined} onChange={(e) => reset(setTo)(e.target.value)} className="h-10 rounded-xl border border-[var(--app-line)] bg-white px-2.5 text-sm text-[var(--app-ink)]" /></label>
            {filtered ? <button onClick={() => { setQ(""); setUserId(""); setCategory(""); setFrom(""); setTo(""); setPage(1); }} className="inline-flex h-10 items-center gap-1 rounded-xl px-3 text-xs font-semibold text-[var(--app-ink-3)] hover:bg-[var(--app-surface-sunk)]"><X className="h-3.5 w-3.5" />Clear</button> : null}
          </div>
        </div>

        {isLoading && !data ? <PanelSkeleton className="m-4 h-64" /> : !data?.logs.length ? (
          <EmptyState icon={ScrollText} title={filtered ? "No activity matches" : "No activity recorded yet"} description={filtered ? "Try a different person, date range or search." : "Sign-ins and changes will be recorded here from now on."} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead><tr className="bg-[var(--app-surface-sunk)] text-left text-[11px] font-bold uppercase tracking-wide text-[var(--app-ink-3)]"><th className="px-5 py-3">When</th><th className="px-3 py-3">Person</th><th className="px-3 py-3">Action</th><th className="px-3 py-3">On</th><th className="px-3 py-3">Detail</th><th className="px-5 py-3">IP</th></tr></thead>
              <tbody>
                {data.logs.map((l) => (
                  <tr key={l.id} className="border-t border-[var(--app-line-soft)] align-top hover:bg-[var(--app-surface-sunk)]">
                    <td className="tnum whitespace-nowrap px-5 py-3.5 text-[var(--app-ink-2)]">{fmtDateTime(l.createdAt)}</td>
                    <td className="px-3 py-3.5"><span className="font-semibold text-[var(--app-ink)]">{l.userName}</span>{l.userRole ? <span className="block text-[11px] text-[var(--app-ink-3)]">{roleLabel(l.userRole as never)}</span> : null}</td>
                    <td className="px-3 py-3.5"><span className={cn("inline-block whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-bold", TONE[l.category] ?? TONE.AUTH)}>{pretty(l.action)}</span></td>
                    <td className="whitespace-nowrap px-3 py-3.5">{l.entityType === "Order" && l.entityId ? <Link href={`/orders/${l.entityId}`} className="font-bold text-[var(--app-brand)] hover:underline">{l.entityLabel}</Link> : <span className="text-[var(--app-ink-2)]">{l.entityLabel ?? "—"}</span>}</td>
                    <td className="max-w-xs px-3 py-3.5 text-[var(--app-ink-2)]"><span className="line-clamp-2">{l.detail ?? "—"}</span></td>
                    <td className="tnum whitespace-nowrap px-5 py-3.5 text-xs text-[var(--app-ink-3)]">{l.ipAddress ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.total > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--app-line-soft)] px-5 py-3 text-sm">
            <p className="tnum text-[var(--app-ink-3)]">Showing {first}–{last} of {data.total}</p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} aria-label="Previous page" className="rounded-lg border border-[var(--app-line)] p-2 hover:bg-[var(--app-surface-sunk)] disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
              <span className="tnum px-3 text-xs font-semibold text-[var(--app-ink-2)]">Page {page} of {pages}</span>
              <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages} aria-label="Next page" className="rounded-lg border border-[var(--app-line)] p-2 hover:bg-[var(--app-surface-sunk)] disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
        ) : null}
      </Panel>
    </>
  );
}
