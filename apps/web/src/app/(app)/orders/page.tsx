"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, FlaskConical, Plus, Search, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { api, fmtDate, fmtMoney } from "@/lib/format";
import { Panel, PageHeader, EmptyState, PanelSkeleton } from "@/components/ui/panel";
import { NextStep } from "@/components/ui/guidance";
import { StatusPill } from "@/components/ui/status-pill";
import { buttonVariants } from "@/components/ui/button";
import { selectClass } from "@/components/ui/field";
import { canCreateEnquiry } from "@/lib/roles";
import { ExportMenu } from "@/components/export-menu";
import { EnquiryStepper } from "@/components/enquiry-stepper";
import { Eye } from "lucide-react";
import { cn } from "@/lib/utils";

type Row = {
  id: number;
  orderNumber: string;
  status: string;
  enquiryDate: string;
  customerName: string;
  companyName: string | null;
  isSample: boolean;
  sampleSentAt: string | null;
  pricePerUnit: string | null;
  priceUnit: string | null;
  clientResponse: string | null;
  division: { id: number; name: string };
  createdBy: { name: string };
};
type Data = { orders: Row[]; total: number; page: number; pageSize: number; counts: Record<string, number> };

const TABS = [
  { key: "", label: "All" },
  { key: "PLACED", label: "Needs pricing" },
  { key: "PRICED", label: "Waiting for client" },
  { key: "CLOSED", label: "Closed" },
  { key: "CANCELLED", label: "Cancelled" },
];

function List() {
  const { user } = useAuth();
  const sp = useSearchParams();
  const [status, setStatus] = useState(sp.get("status") ?? "");
  const [division, setDivision] = useState("");
  const [organization, setOrganization] = useState("");
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const change = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); setPage(1); };

  const qs = new URLSearchParams();
  if (status) qs.set("status", status);
  if (division) qs.set("divisionId", division);
  if (organization) qs.set("organizationId", organization);
  if (q.trim()) qs.set("q", q.trim());
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  const exportQuery = qs.toString();
  qs.set("page", String(page));
  const { data, isLoading } = useQuery({
    queryKey: ["orders", status, division, organization, q, from, to, page],
    queryFn: () => api<Data>(`/api/orders?${qs}`),
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });
  const counts = data?.counts ?? {};
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const filtered = !!(status || division || organization || q.trim() || from || to);
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.pageSize ?? 10)));
  const firstRow = data && data.total ? (data.page - 1) * data.pageSize + 1 : 0;
  const lastRow = data ? Math.min(data.total, data.page * data.pageSize) : 0;
  const role = user?.role;
  const divisions = user?.divisions ?? [];
  const canFilterOrg = role === "SUPER_ADMIN" || role === "MANAGING_DIRECTOR" || role === "ACCOUNTS";
  const { data: og } = useQuery({ queryKey: ["organizations"], queryFn: () => api<{ organizations: { id: number; name: string }[] }>("/api/organizations"), enabled: canFilterOrg, staleTime: 60_000 });
  const organizations = og?.organizations ?? [];
  const viewer = role === "ACCOUNTS" || role === "MANAGING_DIRECTOR";

  let next: React.ReactNode = null;
  if (user && data) {
    if (canCreateEnquiry(role) && role === "MARKETING") {
      next = divisions.length === 0 ? (
        <NextStep tone="wait" title="You aren't mapped to a division yet" description="Ask the admin to map you to a division, or request access, then you can log enquiries." actionLabel="Request division access" actionHref="/divisions" />
      ) : (
        counts.PLACED ? (
          <NextStep title={`${counts.PLACED} enquiries need your pricing`} description="Open one, add the price, then record the sample and client feedback as they happen." actionLabel="Show them" onAction={() => { setStatus("PLACED"); setPage(1); }} />
        ) : counts.PRICED ? (
          <NextStep tone="wait" title={`${counts.PRICED} priced enquiries are waiting for the client`} description="Record what the client says as soon as you hear back." actionLabel="Show them" onAction={() => { setStatus("PRICED"); setPage(1); }} />
        ) : (
          <NextStep title="Log the next client enquiry" description="Enter the client, pick the division and say whether it's a sample." actionLabel="New enquiry" actionHref="/orders/new" />
        )
      );
    } else if (role === "SALES") {
      next = counts.PLACED ? (
        <NextStep title={`${counts.PLACED} enquiries need your pricing`} description="Open one, add the price, then record the sample and client feedback as they happen." actionLabel="Show them" onAction={() => { setStatus("PLACED"); setPage(1); }} />
      ) : counts.PRICED ? (
        <NextStep tone="wait" title={`${counts.PRICED} priced enquiries are waiting for the client`} description="Record what the client says as soon as you hear back." actionLabel="Show them" onAction={() => { setStatus("PRICED"); setPage(1); }} />
      ) : (
        <NextStep tone="done" eyebrow="All caught up" title="Nothing needs your pricing right now" description="New enquiries from Marketing will show up here." />
      );
    }
  }

  return (
    <>
      <PageHeader title="Enquiries" description={total ? `${total} enquiries across ${role === "MARKETING" || role === "SALES" ? "your divisions" : "all divisions"}.` : "Every client enquiry, from first call to feedback."}>
        {user ? <ExportMenu query={exportQuery} generatedBy={user.name} filters={[
          ...(status ? [`Status: ${TABS.find((t) => t.key === status)?.label}`] : []),
          ...(division ? [`Division: ${divisions.find((d) => String(d.id) === division)?.name ?? division}`] : []),
          ...(organization ? [`Organization: ${organizations.find((o) => String(o.id) === organization)?.name ?? organization}`] : []),
          ...(from ? [`From ${from}`] : []),
          ...(to ? [`To ${to}`] : []),
          ...(q.trim() ? [`Search: "${q.trim()}"`] : []),
        ]} /> : null}
        {role === "MARKETING" || role === "SUPER_ADMIN" ? (
          <Link href="/orders/new" className={buttonVariants()}><Plus className="h-4 w-4" /> New enquiry</Link>
        ) : null}
      </PageHeader>

      {next}

      <Panel>
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--app-line-soft)] p-4">
          <div role="tablist" className="flex flex-wrap gap-1.5">
            {TABS.map((t) => {
              const n = t.key ? counts[t.key] ?? 0 : total;
              const on = status === t.key;
              return (
                <button key={t.key} role="tab" aria-selected={on} onClick={() => { setStatus(t.key); setPage(1); }}
                  className={cn("rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors", on ? "bg-[var(--app-brand)] text-white" : "bg-[var(--app-surface-sunk)] text-[var(--app-ink-2)] hover:bg-[var(--app-line-soft)]")}>
                  {t.label} <span className={on ? "text-white/80" : "text-[var(--app-ink-3)]"}>{n}</span>
                </button>
              );
            })}
          </div>
          <div className="ml-auto flex w-full flex-wrap items-center gap-2 sm:w-auto">
            {divisions.length > 1 ? (
              <select aria-label="Division" value={division} onChange={(e) => change(setDivision)(e.target.value)} className={cn(selectClass, "w-44")}>
                <option value="">All divisions</option>
                {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            ) : null}
            {canFilterOrg && organizations.length > 0 ? (
              <select aria-label="Organization" value={organization} onChange={(e) => change(setOrganization)(e.target.value)} className={cn(selectClass, "w-48")}>
                <option value="">All organizations</option>
                {organizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            ) : null}
            <label className="flex items-center gap-1.5 text-xs font-semibold text-[var(--app-ink-3)]">From
              <input type="date" value={from} max={to || undefined} onChange={(e) => change(setFrom)(e.target.value)} aria-label="From date" className="h-10 rounded-xl border border-[var(--app-line)] bg-white px-2.5 text-sm text-[var(--app-ink)]" />
            </label>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-[var(--app-ink-3)]">To
              <input type="date" value={to} min={from || undefined} onChange={(e) => change(setTo)(e.target.value)} aria-label="To date" className="h-10 rounded-xl border border-[var(--app-line)] bg-white px-2.5 text-sm text-[var(--app-ink)]" />
            </label>
            <div className="relative min-w-[12rem] flex-1 sm:w-56 sm:flex-none">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--app-ink-3)]" aria-hidden />
              <input value={q} onChange={(e) => change(setQ)(e.target.value)} placeholder="Search client or enquiry no." aria-label="Search enquiries"
                className="h-10 w-full rounded-xl border border-[var(--app-line)] bg-[var(--app-surface-sunk)] pl-9 pr-3 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--app-brand)]/20" />
            </div>
            {filtered ? (
              <button onClick={() => { setStatus(""); setDivision(""); setOrganization(""); setQ(""); setFrom(""); setTo(""); setPage(1); }} className="inline-flex h-10 items-center gap-1 rounded-xl px-3 text-xs font-semibold text-[var(--app-ink-3)] hover:bg-[var(--app-surface-sunk)] hover:text-[var(--app-ink)]"><X className="h-3.5 w-3.5" />Clear</button>
            ) : null}
          </div>
        </div>

        {isLoading ? (
          <PanelSkeleton className="m-4 h-64" />
        ) : !data?.orders.length ? (
          <EmptyState icon={Search} title={filtered ? "No enquiries match" : "No enquiries yet"}
            description={filtered ? "Try a different filter, or clear them all." : "Enquiries logged by Marketing appear here."}
            action={!q && !status && role === "MARKETING" ? <Link href="/orders/new" className={buttonVariants({ size: "sm" })}>Log the first enquiry</Link> : undefined} />
        ) : role === "MANAGING_DIRECTOR" ? (
          <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.orders.map((o) => (
              <article key={o.id} className="group flex flex-col rounded-2xl border border-[var(--app-line)] bg-[var(--app-surface)] p-5 transition-all hover:-translate-y-0.5 hover:border-[var(--app-brand-line)]">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><p className="text-xs font-bold tracking-wide text-[var(--app-brand)]">{o.orderNumber}{o.isSample ? <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-[var(--app-brand-tint)] px-2 py-0.5 text-[10px]"><FlaskConical className="h-3 w-3" aria-hidden />Sample</span> : null}</p><h3 className="mt-1 truncate text-base font-extrabold text-[var(--app-ink)]">{o.companyName || o.customerName}</h3><p className="text-xs text-[var(--app-ink-3)]">{o.division.name} · {fmtDate(o.enquiryDate)}</p></div>
                  <StatusPill status={o.status} size="sm" />
                </div>
                <div className="my-5"><EnquiryStepper size="sm" isSample={o.isSample} priced={!!o.pricePerUnit} sampleSent={!!o.sampleSentAt} replied={!!o.clientResponse} closed={o.status === "CLOSED"} cancelled={o.status === "CANCELLED"} /></div>
                <div className="mt-auto flex items-end justify-between gap-3 border-t border-[var(--app-line-soft)] pt-4">
                  <div><p className="text-[10px] font-bold uppercase tracking-wider text-[var(--app-ink-3)]">Quoted rate</p><p className="tnum text-lg font-extrabold text-[var(--app-ink)]">{o.pricePerUnit ? <>{fmtMoney(o.pricePerUnit)}<span className="ml-1 text-xs font-semibold text-[var(--app-ink-3)]">/ {o.priceUnit}</span></> : <span className="text-sm font-semibold text-[var(--app-ink-3)]">Not priced</span>}</p></div>
                  <Link href={`/orders/${o.id}`} className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--app-ink)] px-3.5 py-2 text-xs font-semibold text-white hover:bg-black"><Eye className="h-3.5 w-3.5" />View details</Link>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="bg-[var(--app-surface-sunk)] text-left text-[11px] font-bold uppercase tracking-wide text-[var(--app-ink-3)]">
                  <th className="px-5 py-3">Enquiry</th><th className="px-3 py-3">Client</th><th className="px-3 py-3">Division</th>
                  <th className="px-3 py-3">Date</th><th className="px-3 py-3">Price</th><th className="px-3 py-3">Status</th>{viewer ? <th className="px-5 py-3 text-right">Details</th> : null}
                </tr>
              </thead>
              <tbody>
                {data.orders.map((o) => (
                  <tr key={o.id} className="border-t border-[var(--app-line-soft)] transition-colors hover:bg-[var(--app-surface-sunk)]">
                    <td className="px-5 py-3.5">
                      <Link href={`/orders/${o.id}`} className="font-bold text-[var(--app-brand)] hover:underline">{o.orderNumber}</Link>
                      {o.isSample ? <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-[var(--app-brand-tint)] px-2 py-0.5 text-[10px] font-bold text-[var(--app-brand)]"><FlaskConical className="h-3 w-3" aria-hidden />Sample</span> : null}
                    </td>
                    <td className="px-3 py-3.5"><span className="font-semibold text-[var(--app-ink)]">{o.companyName || o.customerName}</span>{o.companyName ? <span className="block text-xs text-[var(--app-ink-3)]">{o.customerName}</span> : null}</td>
                    <td className="px-3 py-3.5 text-[var(--app-ink-2)]">{o.division.name}</td>
                    <td className="tnum px-3 py-3.5 text-[var(--app-ink-2)]">{fmtDate(o.enquiryDate)}</td>
                    <td className="tnum px-3 py-3.5 text-[var(--app-ink-2)]">{o.pricePerUnit ? `${fmtMoney(o.pricePerUnit)} / ${o.priceUnit}` : <span className="text-[var(--app-ink-3)]">Not priced</span>}</td>
                    <td className="px-3 py-3.5"><StatusPill status={o.status} size="sm" /></td>
                    {viewer ? <td className="px-5 py-3.5 text-right"><Link href={`/orders/${o.id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--app-line)] px-3 py-1.5 text-xs font-semibold text-[var(--app-brand)] hover:bg-[var(--app-brand-tint)]"><Eye className="h-3.5 w-3.5" />View details</Link></td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.total > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--app-line-soft)] px-5 py-3 text-sm">
            <p className="tnum text-[var(--app-ink-3)]">Showing {firstRow}–{lastRow} of {data.total}</p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} aria-label="Previous page" className="rounded-lg border border-[var(--app-line)] p-2 text-[var(--app-ink-2)] hover:bg-[var(--app-surface-sunk)] disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
              <span className="tnum px-3 text-xs font-semibold text-[var(--app-ink-2)]">Page {page} of {pages}</span>
              <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages} aria-label="Next page" className="rounded-lg border border-[var(--app-line)] p-2 text-[var(--app-ink-2)] hover:bg-[var(--app-surface-sunk)] disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
        ) : null}
      </Panel>
    </>
  );
}

export default function OrdersPage() {
  return <Suspense fallback={<PanelSkeleton className="h-64" />}><List /></Suspense>;
}
