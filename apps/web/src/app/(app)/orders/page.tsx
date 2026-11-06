"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { FlaskConical, Plus, Search } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { api, fmtDate, fmtMoney } from "@/lib/format";
import { Panel, PageHeader, EmptyState, PanelSkeleton } from "@/components/ui/panel";
import { NextStep } from "@/components/ui/guidance";
import { StatusPill } from "@/components/ui/status-pill";
import { buttonVariants } from "@/components/ui/button";
import { selectClass } from "@/components/ui/field";
import { canCreateEnquiry } from "@/lib/roles";
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
type Data = { orders: Row[]; counts: Record<string, number> };

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
  const [q, setQ] = useState(sp.get("q") ?? "");

  const qs = new URLSearchParams();
  if (status) qs.set("status", status);
  if (division) qs.set("divisionId", division);
  if (q.trim()) qs.set("q", q.trim());
  const { data, isLoading } = useQuery({
    queryKey: ["orders", status, division, q],
    queryFn: () => api<Data>(`/api/orders?${qs}`),
    staleTime: 15_000,
  });
  const counts = data?.counts ?? {};
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const role = user?.role;
  const divisions = user?.divisions ?? [];

  let next: React.ReactNode = null;
  if (user && data) {
    if (canCreateEnquiry(role) && role === "MARKETING") {
      next = divisions.length === 0 ? (
        <NextStep tone="wait" title="You aren't mapped to a division yet" description="Ask the admin to map you to a division, or request access, then you can log enquiries." actionLabel="Request division access" actionHref="/divisions" />
      ) : (
        <NextStep title={counts.PLACED ? `${counts.PLACED} enquiries are waiting for Sales to add pricing` : "Log the next client enquiry"} description="Enter the client, pick the division and say whether it's a sample. Sales picks it up from there." actionLabel="New enquiry" actionHref="/orders/new" />
      );
    } else if (role === "SALES") {
      next = counts.PLACED ? (
        <NextStep title={`${counts.PLACED} enquiries need your pricing`} description="Open one, add the price, then record the sample and client feedback as they happen." actionLabel="Show them" onAction={() => setStatus("PLACED")} />
      ) : counts.PRICED ? (
        <NextStep tone="wait" title={`${counts.PRICED} priced enquiries are waiting for the client`} description="Record what the client says as soon as you hear back." actionLabel="Show them" onAction={() => setStatus("PRICED")} />
      ) : (
        <NextStep tone="done" eyebrow="All caught up" title="Nothing needs your pricing right now" description="New enquiries from Marketing will show up here." />
      );
    }
  }

  return (
    <>
      <PageHeader title="Enquiries" description={total ? `${total} enquiries across ${role === "MARKETING" || role === "SALES" ? "your divisions" : "all divisions"}.` : "Every client enquiry, from first call to feedback."}>
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
                <button key={t.key} role="tab" aria-selected={on} onClick={() => setStatus(t.key)}
                  className={cn("rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors", on ? "bg-[var(--app-brand)] text-white" : "bg-[var(--app-surface-sunk)] text-[var(--app-ink-2)] hover:bg-[var(--app-line-soft)]")}>
                  {t.label} <span className={on ? "text-white/80" : "text-[var(--app-ink-3)]"}>{n}</span>
                </button>
              );
            })}
          </div>
          <div className="ml-auto flex w-full flex-wrap gap-2 sm:w-auto">
            {divisions.length > 1 ? (
              <select aria-label="Division" value={division} onChange={(e) => setDivision(e.target.value)} className={cn(selectClass, "w-44")}>
                <option value="">All divisions</option>
                {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            ) : null}
            <div className="relative flex-1 sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--app-ink-3)]" aria-hidden />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search client or enquiry no." aria-label="Search enquiries"
                className="h-10 w-full rounded-xl border border-[var(--app-line)] bg-[var(--app-surface-sunk)] pl-9 pr-3 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--app-brand)]/20" />
            </div>
          </div>
        </div>

        {isLoading ? (
          <PanelSkeleton className="m-4 h-64" />
        ) : !data?.orders.length ? (
          <EmptyState icon={Search} title={q || status || division ? "No enquiries match" : "No enquiries yet"}
            description={q || status || division ? "Try a different filter or clear the search." : "Enquiries logged by Marketing appear here."}
            action={!q && !status && role === "MARKETING" ? <Link href="/orders/new" className={buttonVariants({ size: "sm" })}>Log the first enquiry</Link> : undefined} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="bg-[var(--app-surface-sunk)] text-left text-[11px] font-bold uppercase tracking-wide text-[var(--app-ink-3)]">
                  <th className="px-5 py-3">Enquiry</th><th className="px-3 py-3">Client</th><th className="px-3 py-3">Division</th>
                  <th className="px-3 py-3">Date</th><th className="px-3 py-3">Price</th><th className="px-5 py-3">Status</th>
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
                    <td className="px-5 py-3.5"><StatusPill status={o.status} size="sm" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

export default function OrdersPage() {
  return <Suspense fallback={<PanelSkeleton className="h-64" />}><List /></Suspense>;
}
