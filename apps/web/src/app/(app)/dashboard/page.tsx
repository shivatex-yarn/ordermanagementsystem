"use client";

import Link from "next/link";
import { LatestEnquiries } from "@/components/dashboard/latest-enquiries";
import { FilterBar, Funnel, OldestWaiting, TeamActivity, TopClients } from "@/components/dashboard/insights";
import { useState } from "react";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { CheckCircle2, CircleDashed, FlaskConical, Hourglass, Plus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { api, fmtDate, fmtMoney } from "@/lib/format";
import { PageHeader, Panel, PanelHeader, PanelLink, PanelSkeleton, EmptyState } from "@/components/ui/panel";
import { NextStep } from "@/components/ui/guidance";
import { StatusPill } from "@/components/ui/status-pill";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Analytics } from "@/lib/analytics";
import { DivisionBars, KpiStrip, ResponseDonut, StatusDonut, TrendChart } from "@/components/dashboard/charts";
import { CalendarPanel } from "@/components/dashboard/calendar-panel";

type Row = { id: number; orderNumber: string; status: string; enquiryDate: string; customerName: string; companyName: string | null; isSample: boolean; pricePerUnit: string | null; priceUnit: string | null; division: { name: string } };
type Data = { byStatus: Record<string, number>; byDivision: { name: string; count: number }[]; mine: number; samplesToSend: number; recent: Row[]; needsPricing: Row[]; analytics: Analytics };

function Tile({ label, value, icon: Icon, tone, href }: { label: string; value: number; icon: React.ComponentType<{ className?: string }>; tone: string; href: string }) {
  return (
    <Link href={href} className="rounded-2xl border border-[var(--app-line)] bg-[var(--app-surface)] p-5 transition-colors hover:border-[var(--app-brand-line)]">
      <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl", tone)}><Icon className="h-5 w-5" aria-hidden /></span>
      <p className="tnum mt-4 text-3xl font-extrabold tracking-tight text-[var(--app-ink)]">{value}</p>
      <p className="mt-0.5 text-sm font-semibold text-[var(--app-ink-2)]">{label}</p>
    </Link>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [days, setDays] = useState(30);
  const [division, setDivision] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", days, division, from, to],
    queryFn: () => api<Data>(`/api/dashboard?days=${days}${division ? `&divisionId=${division}` : ""}${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`),
    staleTime: 20_000,
    placeholderData: keepPreviousData,
  });
  if (isLoading || !data || !user) return <PanelSkeleton className="h-96" />;

  const s = data.byStatus;
  const marketing = user.role === "MARKETING";
  const first = user.name.split(" ")[0];

  let next: React.ReactNode;
  if (marketing && user.divisions.length === 0) {
    next = <NextStep tone="wait" title="You aren't mapped to a division yet" description="Ask the admin to map you, or request access, then you can log enquiries." actionLabel="Request division access" actionHref="/divisions" />;
  } else if (marketing) {
    next = <NextStep title={s.PLACED ? `${s.PLACED} enquiries are waiting for Sales to add pricing` : "Log the next client enquiry"} description="Enter the client, pick the division and say whether it's a sample." actionLabel="New enquiry" actionHref="/orders/new" />;
  } else if (s.PLACED) {
    next = <NextStep title={`${s.PLACED} enquiries need your pricing`} description="Open the oldest first, add the price, then record the sample and client feedback." actionLabel="Open oldest" actionHref={`/orders/${data.needsPricing[0]?.id}`} />;
  } else if (s.PRICED) {
    next = <NextStep tone="wait" title={`${s.PRICED} priced enquiries are waiting for the client`} description="Record what the client says as soon as you hear back." actionLabel="Show them" actionHref="/orders?status=PRICED" />;
  } else {
    next = <NextStep tone="done" eyebrow="All caught up" title="Nothing needs your pricing right now" description="New enquiries from Marketing will show up here." />;
  }

  return (
    <>
      <PageHeader title={`Hello, ${first}`} description={user.divisions.length ? `Your divisions: ${user.divisions.map((d) => d.name).join(", ")}` : "Your enquiries at a glance."}>
        {marketing ? <Link href="/orders/new" className={buttonVariants()}><Plus className="h-4 w-4" /> New enquiry</Link> : null}
      </PageHeader>

      {next}

      <OldestWaiting o={data.analytics.oldestWaiting} />
      <FilterBar days={days} onDays={setDays} from={from} to={to} onRange={(f, t) => { setFrom(f); setTo(t); }} division={division} onDivision={setDivision} divisions={user.divisions} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile label="Needs pricing" value={s.PLACED ?? 0} icon={CircleDashed} tone="bg-[var(--app-act-bg)] text-[var(--app-act-ink)]" href="/orders?status=PLACED" />
        <Tile label="Waiting for client" value={s.PRICED ?? 0} icon={Hourglass} tone="bg-[var(--app-wait-bg)] text-[var(--app-wait-ink)]" href="/orders?status=PRICED" />
        <Tile label="Samples to send" value={data.samplesToSend} icon={FlaskConical} tone="bg-[var(--app-brand-tint)] text-[var(--app-brand)]" href="/orders" />
        <Tile label="Closed" value={s.CLOSED ?? 0} icon={CheckCircle2} tone="bg-[var(--app-done-bg)] text-[var(--app-done-ink)]" href="/orders?status=CLOSED" />
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
          <PanelHeader title="Your divisions" caption={marketing ? `${data.mine} enquiries logged by you` : "Status of every enquiry, by division"} />
          <DivisionBars data={data.analytics.divisionBars} />
        </Panel>
        <Panel>
          <PanelHeader title="Calendar" caption="Enquiries, samples and feedback by day" />
          <CalendarPanel data={data.analytics.calendar} />
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <PanelHeader title="Waiting for pricing" caption="Oldest first" action={<PanelLink href="/orders?status=PLACED">See all</PanelLink>} />
          {data.needsPricing.length === 0 ? <p className="p-5 text-sm text-[var(--app-ink-3)]">Nothing waiting. Every enquiry has a price.</p> : (
            <ul className="divide-y divide-[var(--app-line-soft)]">
              {data.needsPricing.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                  <div className="min-w-0"><Link href={`/orders/${o.id}`} className="whitespace-nowrap text-sm font-bold text-[var(--app-brand)] hover:underline">{o.orderNumber}</Link><p className="truncate text-xs text-[var(--app-ink-2)]">{o.companyName || o.customerName} · {o.division.name}</p></div>
                  <span className="tnum shrink-0 text-xs text-[var(--app-ink-3)]">{fmtDate(o.enquiryDate)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel>
          <PanelHeader title="Client response" caption="Accepted, negotiating, declined" />
          <ResponseDonut data={data.analytics.responseSplit} />
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel>
          <PanelHeader title="Enquiry funnel" caption="How far enquiries get" />
          <Funnel data={data.analytics.funnel} />
        </Panel>
        <Panel>
          <PanelHeader title="Top clients" caption="By number of enquiries" />
          <TopClients data={data.analytics.topClients} />
        </Panel>
        <Panel>
          <PanelHeader title="Team activity" caption="Enquiries logged and priced" />
          <TeamActivity data={data.analytics.team} />
        </Panel>
      </div>

      <LatestEnquiries division={division} dateFrom={from} dateTo={to} />
    </>
  );
}
