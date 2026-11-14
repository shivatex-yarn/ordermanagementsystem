"use client";

import { useState } from "react";
import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, CheckCircle2, FileWarning, Hourglass, XCircle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { api, fmtDate, fmtMoney } from "@/lib/format";
import { EmptyState, PageHeader, Panel, PanelHeader, PanelSkeleton } from "@/components/ui/panel";
import { FilterBar } from "@/components/dashboard/insights";
import { Donut } from "@/components/dashboard/charts";
import { cn } from "@/lib/utils";

import { ExportMenu, rangeQuery } from "@/components/export-menu";

type Data = {
  days: number;
  kpis: { quotes: number; accepted: number; declined: number; acceptRate: number | null; awaiting: number; avgDaysToClose: number | null; gstMissing: number; gstCopyMissing: number };
  trend: { label: string; quotes: number; accepted: number }[];
  rates: { unit: string; quotes: number; avg: number; min: number; max: number }[];
  paymentTerms: { key: string; label: string; value: number }[];
  divisionOutcome: { name: string; accepted: number; negotiating: number; declined: number; awaiting: number }[];
  acceptedDeals: { id: number; orderNumber: string; client: string; division: string; rate: string | null; unit: string | null; quantity: string | null; paymentTerms: string | null; deliveryTime: string | null; closedAt: string | null }[];
  gstGaps: { id: number; orderNumber: string; client: string; division: string; status: string; enquiryDate: string }[];
};

const C = { brand: "#4f46e5", done: "#1baf7a", act: "#eda100", late: "#e24b4a", wait: "#378add", grid: "#eceef2", axis: "#667085" };
const TERM_COLORS = ["#4f46e5", "#378add", "#1baf7a", "#eda100", "#e87ba4", "#98a2b3"];
const tip = { borderRadius: 12, border: "1px solid #e6e8ec", fontSize: 12, boxShadow: "none" } as const;

function Ring({ pct }: { pct: number | null }) {
  const r = 38, c = 2 * Math.PI * r, v = pct ?? 0;
  return (
    <div className="relative h-28 w-28 shrink-0" role="img" aria-label={pct === null ? "No decided quotes yet" : `${pct}% of decided quotes accepted`}>
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="9" />
        <circle cx="50" cy="50" r={r} fill="none" stroke="#7ee0b8" strokeWidth="9" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (c * v) / 100} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="tnum text-2xl font-extrabold text-white">{pct === null ? "—" : `${pct}%`}</span>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-indigo-200">accepted</span>
      </div>
    </div>
  );
}

function Hero({ k }: { k: Data["kpis"] }) {
  const stats = [
    { label: "Quotes issued", value: String(k.quotes) },
    { label: "Deals accepted", value: String(k.accepted) },
    { label: "Avg days to close", value: k.avgDaysToClose === null ? "—" : String(k.avgDaysToClose) },
  ];
  return (
    <section className="overflow-hidden rounded-2xl bg-[var(--app-nav)] p-6 text-white sm:p-7">
      <div className="flex flex-wrap items-center gap-x-10 gap-y-6">
        <Ring pct={k.acceptRate} />
        <dl className="grid flex-1 grid-cols-3 gap-6">
          {stats.map((s) => (
            <div key={s.label}>
              <dt className="text-xs font-semibold text-indigo-200">{s.label}</dt>
              <dd className="tnum mt-1 text-4xl font-extrabold tracking-tight">{s.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function Tile({ label, value, icon: Icon, tone, note }: { label: string; value: number; icon: React.ComponentType<{ className?: string }>; tone: string; note?: string }) {
  return (
    <div className="rounded-2xl border border-[var(--app-line)] bg-[var(--app-surface)] p-5">
      <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl", tone)}><Icon className="h-5 w-5" aria-hidden /></span>
      <p className="tnum mt-4 text-3xl font-extrabold tracking-tight text-[var(--app-ink)]">{value}</p>
      <p className="mt-0.5 text-sm font-semibold text-[var(--app-ink-2)]">{label}</p>
      {note ? <p className="mt-0.5 text-[11px] text-[var(--app-ink-3)]">{note}</p> : null}
    </div>
  );
}

export default function AccountsPage() {
  const { user } = useAuth();
  const [days, setDays] = useState(30);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [division, setDivision] = useState("");
  const [organization, setOrganization] = useState("");
  const { data: og } = useQuery({ queryKey: ["organizations"], queryFn: () => api<{ organizations: { id: number; name: string; active: boolean }[] }>("/api/organizations"), staleTime: 60_000 });
  const qs = new URLSearchParams({ days: String(days) });
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  if (division) qs.set("divisionId", division);
  if (organization) qs.set("organizationId", organization);
  const { data, isLoading } = useQuery({ queryKey: ["accounts", days, from, to, division, organization], queryFn: () => api<Data>(`/api/accounts?${qs}`), placeholderData: keepPreviousData, staleTime: 30_000 });
  if (isLoading || !data) return <PanelSkeleton className="h-[40rem]" />;
  const k = data.kpis;
  const terms = data.paymentTerms.map((t, i) => ({ ...t, color: TERM_COLORS[i % TERM_COLORS.length] }));
  const colorMap = Object.fromEntries(terms.map((t) => [t.key, t.color]));

  return (
    <>
      <PageHeader title="Accounts" description="Quotes, deals, rates and payment terms across every division. Read-only.">
        {user ? <ExportMenu generatedBy={user.name} query={rangeQuery(days, from, to, division, organization)} filters={[
          from || to ? `${from || "start"} to ${to || "today"}` : `Last ${days} days`,
          ...(organization ? [`Organization: ${og?.organizations.find((o) => String(o.id) === organization)?.name ?? organization}`] : []),
          ...(division ? [`Division: ${user.divisions.find((d) => String(d.id) === division)?.name ?? division}`] : []),
        ]} /> : null}
      </PageHeader>
      <FilterBar days={days} onDays={setDays} from={from} to={to} onRange={(f, t) => { setFrom(f); setTo(t); }} division={division} onDivision={setDivision} divisions={user?.divisions ?? []} organization={organization} onOrganization={setOrganization} organizations={og?.organizations ?? []} />

      {k.gstMissing + k.gstCopyMissing > 0 ? (
        <div className="flex items-center gap-3 rounded-2xl border border-[var(--app-act-line)] bg-[var(--app-act-bg)] px-4 py-3 text-sm text-[var(--app-act-ink)]">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          <span>
            {k.gstMissing > 0 ? <><b>{k.gstMissing}</b> open {k.gstMissing === 1 ? "enquiry has" : "enquiries have"} no GST number</> : null}
            {k.gstMissing > 0 && k.gstCopyMissing > 0 ? " and " : null}
            {k.gstCopyMissing > 0 ? <><b>{k.gstCopyMissing}</b> {k.gstCopyMissing === 1 ? "has" : "have"} a GST number but no certificate copy</> : null}
            .{k.gstMissing > 0 ? " See the list below." : ""}
          </span>
        </div>
      ) : null}

      <Hero k={k} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile label="Awaiting client decision" value={k.awaiting} icon={Hourglass} tone="bg-[var(--app-wait-bg)] text-[var(--app-wait-ink)]" note="Priced, not yet accepted or declined" />
        <Tile label="Deals accepted" value={k.accepted} icon={CheckCircle2} tone="bg-[var(--app-done-bg)] text-[var(--app-done-ink)]" />
        <Tile label="Declined" value={k.declined} icon={XCircle} tone="bg-[var(--app-late-bg)] text-[var(--app-late-ink)]" />
        <Tile label="GST details missing" value={k.gstMissing} icon={FileWarning} tone="bg-[var(--app-act-bg)] text-[var(--app-act-ink)]" note="Open enquiries" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <PanelHeader title="Quotes and accepted deals" caption={from || to ? "In your date range" : `Last ${data.days} days`} />
          <div className="h-64 px-2 pb-4 pt-2" role="img" aria-label="Quotes issued and deals accepted per day">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.trend} margin={{ left: -18, right: 12, top: 8 }}>
                <defs><linearGradient id="gq" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.brand} stopOpacity={0.25} /><stop offset="100%" stopColor={C.brand} stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.axis }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={32} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: C.axis }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tip} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="quotes" name="Quotes issued" stroke={C.brand} strokeWidth={2} fill="url(#gq)" />
                <Area type="monotone" dataKey="accepted" name="Deals accepted" stroke={C.done} strokeWidth={2} fill="none" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Payment terms" caption="Across quotes issued" />
          <Donut data={terms} colors={colorMap} centre="quotes" />
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <PanelHeader title="Outcome by division" caption="Where the quotes landed" />
          {data.divisionOutcome.length === 0 ? <p className="p-6 text-sm text-[var(--app-ink-3)]">No quotes in this period.</p> : (
            <div className="px-2 pb-4 pt-2" style={{ height: Math.max(220, data.divisionOutcome.length * 46 + 70) }} role="img" aria-label="Quote outcome by division">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.divisionOutcome} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid stroke={C.grid} horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: C.axis }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="name" width={92} tick={{ fontSize: 12, fill: C.axis }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={tip} cursor={{ fill: "#f6f7f9" }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="accepted" name="Accepted" stackId="a" fill={C.done} />
                  <Bar dataKey="negotiating" name="Negotiating" stackId="a" fill={C.act} />
                  <Bar dataKey="awaiting" name="Awaiting client" stackId="a" fill={C.wait} />
                  <Bar dataKey="declined" name="Declined" stackId="a" fill={C.late} radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>
        <Panel>
          <PanelHeader title="Quoted rates" caption="By unit of measure" />
          {data.rates.length === 0 ? <p className="p-5 text-sm text-[var(--app-ink-3)]">No quotes yet.</p> : (
            <ul className="divide-y divide-[var(--app-line-soft)]">
              {data.rates.map((r) => (
                <li key={r.unit} className="px-5 py-3.5">
                  <div className="flex items-baseline justify-between"><span className="text-sm font-bold capitalize text-[var(--app-ink)]">Per {r.unit}</span><span className="text-[11px] text-[var(--app-ink-3)]">{r.quotes} {r.quotes === 1 ? "quote" : "quotes"}</span></div>
                  <p className="tnum mt-1 text-xl font-extrabold text-[var(--app-brand)]">{fmtMoney(r.avg)}<span className="ml-1.5 text-xs font-semibold text-[var(--app-ink-3)]">average</span></p>
                  <p className="tnum text-xs text-[var(--app-ink-3)]">Low {fmtMoney(r.min)} · High {fmtMoney(r.max)}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel>
        <PanelHeader title="Accepted deals" caption="Latest first, with the agreed terms" />
        {data.acceptedDeals.length === 0 ? <EmptyState icon={CheckCircle2} title="No accepted deals in this period" description="Deals show here once a client accepts a quote." /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead><tr className="bg-[var(--app-surface-sunk)] text-left text-[11px] font-bold uppercase tracking-wide text-[var(--app-ink-3)]"><th className="px-5 py-3">Enquiry</th><th className="px-3 py-3">Client</th><th className="px-3 py-3">Division</th><th className="px-3 py-3">Rate</th><th className="px-3 py-3">Quantity</th><th className="px-3 py-3">Payment terms</th><th className="px-3 py-3">Delivery</th><th className="px-5 py-3">Closed</th></tr></thead>
              <tbody>
                {data.acceptedDeals.map((d) => (
                  <tr key={d.id} className="border-t border-[var(--app-line-soft)] hover:bg-[var(--app-surface-sunk)]">
                    <td className="whitespace-nowrap px-5 py-3.5"><Link href={`/orders/${d.id}`} className="font-bold text-[var(--app-brand)] hover:underline">{d.orderNumber}</Link></td>
                    <td className="px-3 py-3.5 font-semibold text-[var(--app-ink)]">{d.client}</td>
                    <td className="px-3 py-3.5 text-[var(--app-ink-2)]">{d.division}</td>
                    <td className="tnum whitespace-nowrap px-3 py-3.5 font-semibold text-[var(--app-ink)]">{d.rate ? `${fmtMoney(d.rate)} / ${d.unit}` : "—"}</td>
                    <td className="px-3 py-3.5 text-[var(--app-ink-2)]">{d.quantity || "—"}</td>
                    <td className="px-3 py-3.5 text-[var(--app-ink-2)]">{d.paymentTerms || "—"}</td>
                    <td className="px-3 py-3.5 text-[var(--app-ink-2)]">{d.deliveryTime || "—"}</td>
                    <td className="tnum whitespace-nowrap px-5 py-3.5 text-[var(--app-ink-2)]">{fmtDate(d.closedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel>
        <PanelHeader title="Missing GST details" caption="Open enquiries with no GST number" />
        {data.gstGaps.length === 0 ? <p className="p-5 text-sm text-[var(--app-done-ink)]">Every open enquiry has its GST number.</p> : (
          <ul className="divide-y divide-[var(--app-line-soft)]">
            {data.gstGaps.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0"><Link href={`/orders/${g.id}`} className="whitespace-nowrap text-sm font-bold text-[var(--app-brand)] hover:underline">{g.orderNumber}</Link><p className="truncate text-xs text-[var(--app-ink-2)]">{g.client} · {g.division}</p></div>
                <span className="tnum text-xs text-[var(--app-ink-3)]">Enquiry {fmtDate(g.enquiryDate)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
