"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  Inbox,
  Package,
  Plus,
  UserPlus,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Panel, PanelHeader, PanelLink, PageHeader, PanelSkeleton } from "@/components/ui/panel";
import { StatTile } from "@/components/ui/stat-tile";
import { NextStep } from "@/components/ui/guidance";
import { WorkQueue, type ActionItem } from "@/components/dashboard/work-queue";
import { AgentsPanel, type Agent } from "@/components/dashboard/agents-panel";
import { CalendarPanel, type CalendarMap } from "@/components/dashboard/calendar-panel";
import { Legend } from "@/components/dashboard/charts";
import { SERIES } from "@/lib/chart-palette";
import { downloadEnquiriesExcel, fetchAllOrdersForExport } from "@/lib/enquiry-export";
import { roleLabel } from "@/lib/roles";
import { userMayCreateEnquiry } from "@/lib/enquiry-access";

const VolumeChart = dynamic(() => import("@/components/dashboard/charts").then((m) => m.VolumeChart), {
  ssr: false,
  loading: () => <div className="h-[260px] animate-pulse rounded-xl bg-[var(--app-surface-sunk)]" />,
});
const StatusDonut = dynamic(() => import("@/components/dashboard/charts").then((m) => m.StatusDonut), {
  ssr: false,
  loading: () => <div className="h-[180px] animate-pulse rounded-xl bg-[var(--app-surface-sunk)]" />,
});
const CityBars = dynamic(() => import("@/components/dashboard/charts").then((m) => m.CityBars), {
  ssr: false,
  loading: () => <div className="h-[200px] animate-pulse rounded-xl bg-[var(--app-surface-sunk)]" />,
});
const DivisionBars = dynamic(() => import("@/components/dashboard/charts").then((m) => m.DivisionBars), {
  ssr: false,
  loading: () => <div className="h-[200px] animate-pulse rounded-xl bg-[var(--app-surface-sunk)]" />,
});

type Overview = {
  totals: {
    total: number;
    open: number;
    placed: number;
    inProgress: number;
    transferred: number;
    completed: number;
    rejected: number;
    cancelled: number;
    overdue: number;
    createdThisWeek: number;
    completedThisWeek: number;
    thisMonth: number;
  };
  monthly: { month: string; year: number; submitted: number; completed: number }[];
  statusSplit: { key: string; label: string; count: number }[];
  byDivision: { name: string; count: number }[];
  byCity: { name: string; count: number }[];
  unknownCity: number;
  calendar: CalendarMap;
  topAgents: Agent[];
  needsYou: ActionItem[];
  waitingOn: ActionItem[];
  needsYouTotal: number;
  waitingOnTotal: number;
};

export default function DashboardPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [exporting, setExporting] = useState(false);

  const { data: overview, isLoading: overviewLoading } = useQuery<Overview>({
    queryKey: ["dashboard", "overview"],
    queryFn: async () => {
      const res = await fetch("/api/dashboard/overview", { credentials: "include" });
      if (!res.ok) throw new Error("Could not load the dashboard");
      return res.json();
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  if (authLoading || !user) {
    return (
      <div className="space-y-5">
        <PanelSkeleton className="h-24" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <PanelSkeleton key={i} className="h-32" />
          ))}
        </div>
        <PanelSkeleton className="h-80" />
      </div>
    );
  }

  const role = user.role as string;
  const isSales = role === "USER";
  const isHead = role === "DIVISION_HEAD" || role === "MANAGER";
  const isProduction = role === "SUPERVISOR";
  const isObserver = role === "ASM";
  // ASM raises enquiries too, not just Marketing / Sales — keep this in step
  // with the enquiry list and the server-side rule.
  const canCreate = userMayCreateEnquiry(role);

  const t = overview?.totals;
  const needsCount = overview?.needsYouTotal ?? 0;
  const waitingCount = overview?.waitingOnTotal ?? 0;
  const first = overview?.needsYou[0];

  async function handleExport() {
    setExporting(true);
    try {
      const rows = await fetchAllOrdersForExport({ period: "" });
      downloadEnquiriesExcel(rows, "All time", isSales);
    } catch {
      // The button returns to its resting state; the enquiry list is the fallback.
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* ── Who you are and what you can do here ─────────────────── */}
      <PageHeader
        title={`Good to see you, ${user.name.split(" ")[0]}`}
        description={`${roleLabel(role as Parameters<typeof roleLabel>[0])} workspace — everything below is scoped to what you are responsible for.`}
      >
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--app-line)] bg-white px-3.5 text-sm font-semibold text-[var(--app-ink-2)] hover:bg-[var(--app-surface-sunk)] disabled:opacity-60"
        >
          <FileSpreadsheet className="h-4 w-4" aria-hidden />
          {exporting ? "Preparing…" : "Export"}
        </button>
        {canCreate ? (
          <Link
            href="/orders/new"
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--app-brand)] px-4 text-sm font-semibold text-white hover:bg-[var(--app-brand-strong)]"
          >
            <Plus className="h-4 w-4" aria-hidden />
            New enquiry
          </Link>
        ) : null}
      </PageHeader>

      {/* ── The one thing to do next ──────────────────────────────── */}
      {overviewLoading ? (
        <PanelSkeleton className="h-28" />
      ) : needsCount > 0 && first ? (
        <NextStep
          tone={first.overdue ? "late" : "act"}
          eyebrow="Your next step"
          title={
            needsCount === 1
              ? "One enquiry is waiting on you"
              : `${needsCount} enquiries are waiting on you`
          }
          description={`Start with ${first.company || first.customer || "the oldest one"}: ${first.reason}`}
          actionLabel={first.actionLabel}
          actionHref={`/orders/${first.id}`}
        />
      ) : waitingCount > 0 ? (
        <NextStep
          tone="wait"
          eyebrow="Nothing needs you right now"
          title="You are up to date"
          description={`${waitingCount} enquir${waitingCount === 1 ? "y is" : "ies are"} moving with someone else. You will be notified the moment one comes back to you.`}
          actionLabel="See what they are waiting on"
          actionHref="/orders"
        />
      ) : (
        <NextStep
          tone="done"
          eyebrow="All clear"
          title="No open work in your queue"
          description={
            canCreate
              ? "When you submit a new enquiry it will appear here with its next step."
              : "New enquiries will appear here as soon as they reach you."
          }
          actionLabel={canCreate ? "Create an enquiry" : "Browse enquiries"}
          actionHref={canCreate ? "/orders/new" : "/orders"}
        />
      )}

      {/* ── Headline numbers ──────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label={isSales ? "Enquiries you submitted" : "Enquiries in your scope"}
          value={t?.total ?? 0}
          caption={t ? `${t.thisMonth} opened this month` : undefined}
          icon={Package}
          tone="brand"
          href="/orders"
          loading={overviewLoading}
          delta={t && t.createdThisWeek > 0 ? `+${t.createdThisWeek} this week` : undefined}
          deltaDirection="up"
        />
        <StatTile
          label={isHead ? "Waiting for you to accept" : "Awaiting acceptance"}
          value={t?.placed ?? 0}
          caption={isHead ? "Nobody can start until you decide" : "With the division head"}
          icon={Inbox}
          tone={(t?.placed ?? 0) > 0 ? "act" : "neutral"}
          href="/orders?status=PLACED"
          loading={overviewLoading}
        />
        <StatTile
          label="In progress"
          value={t?.inProgress ?? 0}
          caption={isProduction ? "Work on the floor" : "Accepted and being worked on"}
          icon={Clock}
          tone={(t?.inProgress ?? 0) > 0 ? "wait" : "neutral"}
          href="/orders?status=IN_PROGRESS"
          loading={overviewLoading}
        />
        {isObserver || isHead || !isSales ? (
          <StatTile
            label="Past deadline"
            value={t?.overdue ?? 0}
            caption={(t?.overdue ?? 0) > 0 ? "These need an explanation" : "Nothing is late"}
            icon={AlertTriangle}
            tone={(t?.overdue ?? 0) > 0 ? "late" : "done"}
            href="/orders"
            loading={overviewLoading}
          />
        ) : (
          <StatTile
            label="Completed"
            value={t?.completed ?? 0}
            caption={t ? `${t.completedThisWeek} closed this week` : undefined}
            icon={CheckCircle2}
            tone="done"
            href="/orders?status=COMPLETED"
            loading={overviewLoading}
          />
        )}
      </div>

      {/* ── The two queues: yours, and everyone else's ────────────── */}
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel>
          <PanelHeader
            title="Needs you"
            caption="You owe the next move on these"
            action={needsCount > 0 ? <PanelLink href="/orders">All enquiries</PanelLink> : undefined}
          />
          {overviewLoading ? (
            <div className="space-y-2 p-5">
              <div className="h-16 animate-pulse rounded-xl bg-[var(--app-surface-sunk)]" />
              <div className="h-16 animate-pulse rounded-xl bg-[var(--app-surface-sunk)]" />
            </div>
          ) : (
            <WorkQueue
              items={overview?.needsYou ?? []}
              total={needsCount}
              kind="act"
              emptyTitle="Nothing is waiting on you"
              emptyDescription="Every enquiry in your scope is either finished or sitting with somebody else."
            />
          )}
        </Panel>

        <Panel>
          <PanelHeader title="Waiting on someone else" caption="Named, so you know who to chase" />
          {overviewLoading ? (
            <div className="space-y-2 p-5">
              <div className="h-16 animate-pulse rounded-xl bg-[var(--app-surface-sunk)]" />
              <div className="h-16 animate-pulse rounded-xl bg-[var(--app-surface-sunk)]" />
            </div>
          ) : (
            <WorkQueue
              items={overview?.waitingOn ?? []}
              total={waitingCount}
              kind="wait"
              emptyTitle="Nothing is pending elsewhere"
              emptyDescription="No enquiry in your scope is currently blocked on another person."
            />
          )}
        </Panel>
      </div>

      {/* ── Volume and mix ───────────────────────────────────────── */}
      <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <Panel>
          <PanelHeader
            title="Enquiry volume"
            caption="Submitted against completed, by month"
            action={
              <Legend
                items={[
                  { label: "Submitted", color: SERIES.primary },
                  { label: "Completed", color: SERIES.secondary },
                ]}
              />
            }
          />
          <div className="p-5">
            {overviewLoading ? (
              <div className="h-[260px] animate-pulse rounded-xl bg-[var(--app-surface-sunk)]" />
            ) : (
              <VolumeChart data={overview?.monthly ?? []} />
            )}
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Where everything sits" caption="Current status of every enquiry you can see" />
          <div className="p-5">
            {overviewLoading ? (
              <div className="h-[180px] animate-pulse rounded-xl bg-[var(--app-surface-sunk)]" />
            ) : (
              <StatusDonut data={overview?.statusSplit ?? []} />
            )}
          </div>
        </Panel>
      </div>

      {/* ── People, places, dates ─────────────────────────────────── */}
      <div className="grid gap-5 xl:grid-cols-3">
        <Panel>
          <PanelHeader title="Customers by location" caption="Derived from the address text on each enquiry" />
          <div className="p-5">
            {overviewLoading ? (
              <div className="h-[200px] animate-pulse rounded-xl bg-[var(--app-surface-sunk)]" />
            ) : (
              <>
                <CityBars data={overview?.byCity ?? []} />
                {overview && overview.unknownCity > 0 ? (
                  <p className="mt-4 border-t border-[var(--app-line-soft)] pt-3 text-xs text-[var(--app-ink-3)]">
                    {overview.unknownCity} enquir{overview.unknownCity === 1 ? "y has" : "ies have"} no
                    usable address, so they are not counted above.
                  </p>
                ) : null}
              </>
            )}
          </div>
        </Panel>

        {isSales ? (
          <Panel>
            <PanelHeader title="Divisions handling your work" caption="Where your enquiries currently sit" />
            <div className="p-5">
              {overviewLoading ? (
                <div className="h-[200px] animate-pulse rounded-xl bg-[var(--app-surface-sunk)]" />
              ) : (
                <DivisionBars data={overview?.byDivision ?? []} />
              )}
            </div>
          </Panel>
        ) : (
          <Panel>
            <PanelHeader title="Top people" caption="Ranked by enquiries submitted" />
            {overviewLoading ? (
              <div className="space-y-2 p-5">
                <div className="h-12 animate-pulse rounded-xl bg-[var(--app-surface-sunk)]" />
                <div className="h-12 animate-pulse rounded-xl bg-[var(--app-surface-sunk)]" />
                <div className="h-12 animate-pulse rounded-xl bg-[var(--app-surface-sunk)]" />
              </div>
            ) : (
              <AgentsPanel agents={overview?.topAgents ?? []} />
            )}
          </Panel>
        )}

        <Panel>
          <PanelHeader title="Deadlines calendar" caption="Which days have enquiries falling due" />
          {overviewLoading ? (
            <div className="m-5 h-[280px] animate-pulse rounded-xl bg-[var(--app-surface-sunk)]" />
          ) : (
            <CalendarPanel data={overview?.calendar ?? {}} />
          )}
        </Panel>
      </div>

      {/* ── Division load, for anyone who oversees more than one ──── */}
      {!isSales && (overview?.byDivision.length ?? 0) > 1 ? (
        <Panel>
          <PanelHeader title="Load by division" caption="Every enquiry you can see, grouped by where it sits" />
          <div className="p-5">
            <DivisionBars data={overview?.byDivision ?? []} />
          </div>
        </Panel>
      ) : null}

      {/* ── A plain explanation of how work reaches you ───────────── */}
      <Panel className="bg-[var(--app-surface-sunk)]">
        <div className="flex flex-wrap items-start gap-4 p-5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white">
            <UserPlus className="h-4.5 w-4.5 text-[var(--app-brand)]" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-[var(--app-ink)]">How work reaches you</p>
            <p className="mt-1 text-sm leading-relaxed text-[var(--app-ink-2)]">
              {isSales
                ? "You submit an enquiry, the division head accepts it and assigns production, a sample is prepared and sent, then you confirm receipt and record what the customer said. Each of those steps appears above the moment it becomes yours."
                : isHead
                  ? "Salespeople submit enquiries to your division. You accept or reject, assign a production person, and approve sample specifications. Anything sitting unassigned shows up in 'Needs you' until somebody owns it."
                  : isProduction
                    ? "The division head assigns enquiries to you. Prepare the sample, record the dispatch details, and the enquiry moves back to sales for customer feedback."
                    : "Enquiries flow from sales to a division head, to production, and back to sales for customer feedback. Anything stuck at a step appears in the queues above."}
            </p>
          </div>
        </div>
      </Panel>
    </div>
  );
}
