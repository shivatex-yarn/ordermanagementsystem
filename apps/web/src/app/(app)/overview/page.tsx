"use client";

import Link from "next/link";
import { LatestEnquiries } from "@/components/dashboard/latest-enquiries";
import { FilterBar, Funnel, OldestWaiting, TeamActivity, TopClients } from "@/components/dashboard/insights";
import { useState } from "react";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { CheckCircle2, CircleDashed, FlaskConical, Hourglass, ListChecks } from "lucide-react";
import { api, fmtDate, fmtMoney } from "@/lib/format";
import { PageHeader, Panel, PanelHeader, PanelLink, PanelSkeleton, EmptyState } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status-pill";
import { cn } from "@/lib/utils";
import type { Analytics } from "@/lib/analytics";
import { DivisionBars, KpiStrip, ResponseDonut, StatusDonut, TrendChart } from "@/components/dashboard/charts";
import { CalendarPanel } from "@/components/dashboard/calendar-panel";

type Overview = {
  byStatus: Record<string, number>;
  byDivision: { name: string; count: number }[];
  samples: number;
  recent: { id: number; orderNumber: string; status: string; enquiryDate: string; customerName: string; companyName: string | null; pricePerUnit: string | null; priceUnit: string | null; division: { name: string } }[];
  analytics: Analytics;
  feedback: { id: number; orderNumber: string; customerName: string; companyName: string | null; clientFeedback: string | null; clientResponse: string | null; clientFeedbackAt: string | null; division: { name: string } }[];
};

function Tile({ label, value, icon: Icon, tone, href }: { label: string; value: number; icon: React.ComponentType<{ className?: string }>; tone: string; href: string }) {
  return (
    <Link href={href} className="group rounded-2xl border border-[var(--app-line)] bg-[var(--app-surface)] p-5 transition-colors hover:border-[var(--app-brand-line)]">
      <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl", tone)}><Icon className="h-5 w-5" aria-hidden /></span>
      <p className="tnum mt-4 text-3xl font-extrabold tracking-tight text-[var(--app-ink)]">{value}</p>
      <p className="mt-0.5 text-sm font-semibold text-[var(--app-ink-2)]">{label}</p>
    </Link>
  );
}

export default function OverviewPage() {
  const { user } = useAuth();
  const [days, setDays] = useState(30);
  const [division, setDivision] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["overview", days, division, from, to],
    queryFn: () => api<Overview>(`/api/overview?days=${days}${division ? `&divisionId=${division}` : ""}${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
  if (isLoading || !data) return <PanelSkeleton className="h-96" />;
  const s = data.byStatus;
  return (
    <>
      <PageHeader title="Overview" description="Every division at a glance. Read-only." />
      <OldestWaiting o={data.analytics.oldestWaiting} />
      <FilterBar days={days} onDays={setDays} from={from} to={to} onRange={(f, t) => { setFrom(f); setTo(t); }} division={division} onDivision={setDivision} divisions={user?.divisions ?? []} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile label="Needs pricing" value={s.PLACED ?? 0} icon={CircleDashed} tone="bg-[var(--app-act-bg)] text-[var(--app-act-ink)]" href="/orders?status=PLACED" />
        <Tile label="Waiting for client" value={s.PRICED ?? 0} icon={Hourglass} tone="bg-[var(--app-wait-bg)] text-[var(--app-wait-ink)]" href="/orders?status=PRICED" />
        <Tile label="Closed" value={s.CLOSED ?? 0} icon={CheckCircle2} tone="bg-[var(--app-done-bg)] text-[var(--app-done-ink)]" href="/orders?status=CLOSED" />
        <Tile label="Sample requests" value={data.samples} icon={FlaskConical} tone="bg-[var(--app-brand-tint)] text-[var(--app-brand)]" href="/orders" />
      </div>

      <Panel><KpiStrip k={data.analytics.kpis} /></Panel>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <PanelHeader title={from || to ? "Enquiries in your date range" : `Enquiries, last ${data.analytics.days} days`} caption="Logged and closed each day" />
          <TrendChart data={data.analytics.trend} />
        </Panel>
        <Panel>
          <PanelHeader title="By status" caption={from || to ? "Enquiries logged in the range" : `Enquiries logged in the last ${data.analytics.days} days`} />
          <StatusDonut data={data.analytics.statusSplit} />
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <PanelHeader title="Enquiries by division" caption="Needs pricing, waiting for client, closed" />
          <DivisionBars data={data.analytics.divisionBars} />
        </Panel>
        <Panel>
          <PanelHeader title="Calendar" caption="Enquiries, samples and feedback by day" />
          <CalendarPanel data={data.analytics.calendar} />
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <PanelHeader title="Latest client feedback" />
          {data.feedback.length === 0 ? <p className="p-5 text-sm text-[var(--app-ink-3)]">No feedback recorded yet.</p> : (
            <ul className="divide-y divide-[var(--app-line-soft)]">
              {data.feedback.map((f) => (
                <li key={f.id} className="px-5 py-3.5">
                  <div className="flex items-center justify-between gap-3"><Link href={`/orders/${f.id}`} className="whitespace-nowrap text-sm font-bold text-[var(--app-brand)] hover:underline">{f.orderNumber}</Link><span className="text-[11px] text-[var(--app-ink-3)]">{f.division.name} · {fmtDate(f.clientFeedbackAt)}</span></div>
                  <p className="mt-1 line-clamp-2 text-sm text-[var(--app-ink-2)]">{f.clientFeedback}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel>
          <PanelHeader title="Client response" />
          <ResponseDonut data={data.analytics.responseSplit} />
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel><PanelHeader title="Enquiry funnel" caption="How far enquiries get" /><Funnel data={data.analytics.funnel} /></Panel>
        <Panel><PanelHeader title="Top clients" caption="By number of enquiries" /><TopClients data={data.analytics.topClients} /></Panel>
        <Panel><PanelHeader title="Team activity" caption="Enquiries logged and priced" /><TeamActivity data={data.analytics.team} /></Panel>
      </div>

      <LatestEnquiries division={division} dateFrom={from} dateTo={to} />
    </>
  );
}
