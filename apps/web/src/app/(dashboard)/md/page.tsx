"use client";

/**
 * Managing Director — executive overview.
 *
 * Deliberately quiet. An MD does not work enquiries, so this page answers three
 * questions and nothing else: what is going wrong, where is it going wrong, and
 * what has moved recently. Everything actionable links through to the enquiry
 * itself rather than being editable here.
 */

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  AlertOctagon,
  Building2,
  CheckCircle2,
  Clock,
  Search,
  ShieldAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Panel, PanelHeader, PanelLink, PageHeader, EmptyState, PanelSkeleton } from "@/components/ui/panel";
import { StatTile } from "@/components/ui/stat-tile";
import { StatusPill } from "@/components/ui/status-pill";
import { Callout, NextStep } from "@/components/ui/guidance";
import { Button } from "@/components/ui/button";
import { formatEnquiryNumberShort } from "@/lib/enquiry-display";

const StatusDonut = dynamic(() => import("@/components/dashboard/charts").then((m) => m.StatusDonut), {
  ssr: false,
  loading: () => <div className="h-[180px] animate-pulse rounded-xl bg-[var(--app-surface-sunk)]" />,
});
const DivisionBars = dynamic(() => import("@/components/dashboard/charts").then((m) => m.DivisionBars), {
  ssr: false,
  loading: () => <div className="h-[200px] animate-pulse rounded-xl bg-[var(--app-surface-sunk)]" />,
});

type Overview = {
  statusCounts: Record<string, number>;
  openBreaches: number;
  pendingApprovalsCount: number;
  samplesPendingHead: number;
  priorityCounts: Record<string, number>;
  divisionSla: Array<{
    divisionId: number;
    divisionName: string;
    total: number;
    explained: number;
    pending: number;
    oldestBreachAt: string | null;
  }>;
  delayedEnquiries: Array<{
    id: number;
    orderNumber: string;
    status: string;
    slaDeadline: string | null;
    companyName: string | null;
    currentDivision: { id: number; name: string };
  }>;
  recentBreaches: Array<{
    id: number;
    breachedAt: string;
    order: { id: number; orderNumber: string; status: string };
    division: { id: number; name: string };
    headRejectedAt: string | null;
    headRejectedBy: { id: number; name: string; email: string } | null;
    headRejectionMessage: string | null;
  }>;
  pipeline: Array<{
    id: number;
    orderNumber: string;
    status: string;
    companyName: string | null;
    descriptionPreview: string | null;
    createdAt: string;
    updatedAt: string;
    slaDeadline: string | null;
    transferCount: number;
    currentDivision: { id: number; name: string };
    divisionHeads: Array<{ name: string; email: string }>;
    createdBy: { id: number; name: string; email: string };
    acceptedBy: { id: number; name: string; email: string } | null;
    responseSummary: string;
    escalated: boolean;
    breachAt: string | null;
    pastDueSla: boolean;
    hoursPastSla: number | null;
  }>;
  recentTimeline: Array<{
    id: number;
    type: string;
    title: string;
    detail: string | null;
    createdAt: string;
    actor: { id: number; name: string; email: string; role: string } | null;
    order: {
      id: number;
      orderNumber: string;
      companyName: string | null;
      currentDivisionId: number;
      currentDivision: { id: number; name: string };
    };
  }>;
};

const STATUS_LABEL: Record<string, string> = {
  PLACED: "Awaiting acceptance",
  IN_PROGRESS: "In progress",
  TRANSFERRED: "Transferred",
  REJECTED: "Rejected",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

function relativeTime(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function MDOverviewPage() {
  const [search, setSearch] = useState("");
  const [lens, setLens] = useState<"attention" | "all">("attention");

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["md-overview"],
    queryFn: async () => {
      const res = await fetch("/api/md/overview", { credentials: "include" });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `Overview endpoint returned ${res.status}`);
      }
      return (await res.json()) as Overview;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 1,
    retryDelay: 1000,
  });

  const totalEnquiries = useMemo(
    () => (data ? Object.values(data.statusCounts).reduce((a, b) => a + b, 0) : 0),
    [data]
  );

  const statusSplit = useMemo(
    () =>
      Object.entries(data?.statusCounts ?? {})
        .filter(([, count]) => count > 0)
        .map(([key, count]) => ({ key, label: STATUS_LABEL[key] ?? key, count })),
    [data]
  );

  const divisionLoad = useMemo(() => {
    const m = new Map<string, number>();
    for (const row of data?.pipeline ?? []) {
      m.set(row.currentDivision.name, (m.get(row.currentDivision.name) ?? 0) + 1);
    }
    return Array.from(m.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [data]);

  /** The only list an MD really needs: what is stuck, and who is holding it. */
  const attention = useMemo(() => {
    const rows = data?.pipeline ?? [];
    const base = lens === "attention" ? rows.filter((r) => r.escalated || r.pastDueSla) : rows;
    if (!search.trim()) return base;
    const needle = search.trim().toLowerCase();
    return base.filter((r) =>
      `${r.orderNumber} ${r.companyName ?? ""} ${r.currentDivision.name}`.toLowerCase().includes(needle)
    );
  }, [data, lens, search]);

  const unexplainedBreaches = (data?.recentBreaches ?? []).filter((b) => !b.headRejectedAt);
  const stuckCount = (data?.pipeline ?? []).filter((r) => r.escalated || r.pastDueSla).length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Executive overview"
        description="Every enquiry across every division. Nothing here needs you to act — it tells you who does."
      >
        <span className="inline-flex items-center gap-2 rounded-full border border-[var(--app-line)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--app-ink-2)]">
          <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-[var(--app-done-ink)]" aria-hidden />
          Live · refreshes every minute
        </span>
      </PageHeader>

      {error ? (
        <Callout
          tone="late"
          title="Could not load the executive overview"
          action={
            <Button type="button" variant="outline" onClick={() => refetch()}>
              Try again
            </Button>
          }
        >
          <p>{(error as Error).message}</p>
        </Callout>
      ) : null}

      {/* ── The one sentence an MD should read first ─────────────── */}
      {!isLoading && !error ? (
        stuckCount > 0 ? (
          <NextStep
            tone="late"
            eyebrow="Needs attention"
            title={`${stuckCount} enquir${stuckCount === 1 ? "y is" : "ies are"} stuck or past deadline`}
            description={
              unexplainedBreaches.length > 0
                ? `${unexplainedBreaches.length} of them have breached with no explanation from the division head yet.`
                : "Each one is listed below with the division currently holding it."
            }
          />
        ) : (
          <NextStep
            tone="done"
            eyebrow="All clear"
            title="Nothing is stuck or past its deadline"
            description="Every open enquiry is inside its SLA window and moving normally."
          />
        )
      ) : null}

      {/* ── Four numbers, no more ────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Total enquiries"
          value={totalEnquiries}
          caption="All time, every division"
          icon={Building2}
          tone="brand"
          loading={isLoading}
        />
        <StatTile
          label="Waiting on a division head"
          value={data?.pendingApprovalsCount ?? 0}
          caption="Nobody can start until they accept"
          icon={Clock}
          tone={(data?.pendingApprovalsCount ?? 0) > 0 ? "act" : "done"}
          loading={isLoading}
        />
        <StatTile
          label="Breached SLA"
          value={data?.openBreaches ?? 0}
          caption={(data?.openBreaches ?? 0) > 0 ? "Owed an explanation" : "Nothing has breached"}
          icon={AlertOctagon}
          tone={(data?.openBreaches ?? 0) > 0 ? "late" : "done"}
          loading={isLoading}
        />
        <StatTile
          label="Samples awaiting sign-off"
          value={data?.samplesPendingHead ?? 0}
          caption="Division head has not approved the specs"
          icon={ShieldAlert}
          tone={(data?.samplesPendingHead ?? 0) > 0 ? "act" : "done"}
          loading={isLoading}
        />
      </div>

      {/* ── Shape of the book ────────────────────────────────────── */}
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel>
          <PanelHeader title="Where everything sits" caption="Status of every enquiry on record" />
          <div className="p-5">
            {isLoading ? <PanelSkeleton className="h-[180px]" /> : <StatusDonut data={statusSplit} />}
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Open load by division" caption="Which units are carrying the work" />
          <div className="p-5">
            {isLoading ? <PanelSkeleton className="h-[200px]" /> : <DivisionBars data={divisionLoad} />}
          </div>
        </Panel>
      </div>

      {/* ── Division SLA record ──────────────────────────────────── */}
      <Panel>
        <PanelHeader
          title="SLA record by division"
          caption="Breaches recorded, and how many still have no explanation"
          action={<PanelLink href="/sla">Full breach record</PanelLink>}
        />
        {isLoading ? (
          <div className="space-y-2 p-5">
            <PanelSkeleton className="h-10" />
            <PanelSkeleton className="h-10" />
          </div>
        ) : (data?.divisionSla ?? []).length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="No division has breached an SLA"
            description="Nothing has missed its deadline since records began."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] border-collapse text-left">
              <thead>
                <tr className="border-b border-[var(--app-line-soft)] bg-[var(--app-surface-sunk)]">
                  <th scope="col" className="px-5 py-2.5 text-[11px] font-bold uppercase tracking-wide text-[var(--app-ink-3)]">
                    Division
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-[var(--app-ink-3)]">
                    Breaches
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-[var(--app-ink-3)]">
                    Explained
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-[var(--app-ink-3)]">
                    No reason given
                  </th>
                  <th scope="col" className="px-5 py-2.5 text-[11px] font-bold uppercase tracking-wide text-[var(--app-ink-3)]">
                    Oldest
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--app-line-soft)]">
                {(data?.divisionSla ?? []).map((d) => (
                  <tr key={d.divisionId} className="hover:bg-[var(--app-brand-tint)]/30">
                    <td className="px-5 py-3 text-sm font-bold text-[var(--app-ink)]">{d.divisionName}</td>
                    <td className="tnum px-3 py-3 text-sm text-[var(--app-ink-2)]">{d.total}</td>
                    <td className="tnum px-3 py-3 text-sm text-[var(--app-ink-2)]">{d.explained}</td>
                    <td className="px-3 py-3">
                      {d.pending > 0 ? (
                        <span className="tnum inline-flex rounded-full border border-[var(--app-act-line)] bg-[var(--app-act-bg)] px-2.5 py-1 text-[11px] font-bold text-[var(--app-act-ink)]">
                          {d.pending}
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--app-ink-3)]">None</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-xs text-[var(--app-ink-3)]">
                      {d.oldestBreachAt ? relativeTime(d.oldestBreachAt) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* ── The pipeline, filtered down to what matters ──────────── */}
      <Panel>
        <PanelHeader
          title={lens === "attention" ? "Enquiries needing attention" : "All open enquiries"}
          caption={
            lens === "attention"
              ? "Past deadline or escalated, with the division currently holding each one"
              : "Everything currently in flight"
          }
          action={
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <label htmlFor="md-search" className="sr-only">
                  Search enquiries
                </label>
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--app-ink-3)]"
                  aria-hidden
                />
                <input
                  id="md-search"
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Company or number"
                  className="h-9 w-48 rounded-lg border border-[var(--app-line)] bg-white pl-8 pr-3 text-xs text-[var(--app-ink)] placeholder:text-[var(--app-ink-3)] focus:border-[var(--app-brand-line)] focus:outline-none"
                />
              </div>
              {(["attention", "all"] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  aria-pressed={lens === l}
                  onClick={() => setLens(l)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-xs font-semibold",
                    lens === l
                      ? "bg-[var(--app-brand)] text-white"
                      : "border border-[var(--app-line)] text-[var(--app-ink-2)] hover:bg-[var(--app-surface-sunk)]"
                  )}
                >
                  {l === "attention" ? "Needs attention" : "All open"}
                </button>
              ))}
            </div>
          }
        />

        {isLoading ? (
          <div className="space-y-2 p-5">
            <PanelSkeleton className="h-14" />
            <PanelSkeleton className="h-14" />
            <PanelSkeleton className="h-14" />
          </div>
        ) : attention.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title={lens === "attention" ? "Nothing needs your attention" : "No open enquiries"}
            description={
              lens === "attention"
                ? "No enquiry is past its deadline or escalated. Switch to “All open” to see everything in flight."
                : "There are no enquiries currently in flight."
            }
          />
        ) : (
          <ul className="divide-y divide-[var(--app-line-soft)]">
            {attention.slice(0, 25).map((r) => (
              <li key={r.id} className="flex flex-wrap items-start gap-3 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/orders/${r.id}`}
                      className="tnum rounded-md bg-[var(--app-surface-sunk)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--app-ink-2)] hover:text-[var(--app-brand)]"
                    >
                      {formatEnquiryNumberShort(r.orderNumber)}
                    </Link>
                    <Link
                      href={`/orders/${r.id}`}
                      className="min-w-0 truncate text-sm font-bold text-[var(--app-ink)] hover:underline"
                    >
                      {r.companyName || "Untitled enquiry"}
                    </Link>
                    <StatusPill status={r.status} size="sm" />
                    {r.escalated ? (
                      <span className="rounded-full border border-[var(--app-late-line)] bg-[var(--app-late-bg)] px-2 py-0.5 text-[10px] font-bold text-[var(--app-late-ink)]">
                        Escalated
                      </span>
                    ) : null}
                  </div>

                  <p className="mt-1 text-sm text-[var(--app-ink-2)]">
                    Held by <span className="font-semibold">{r.currentDivision.name}</span>
                    {r.divisionHeads.length > 0 ? (
                      <> — {r.divisionHeads.map((h) => h.name).join(", ")}</>
                    ) : (
                      <> — no division head mapped</>
                    )}
                  </p>

                  <p className="mt-0.5 text-xs text-[var(--app-ink-3)]">
                    Raised by {r.createdBy.name} · updated {relativeTime(r.updatedAt)}
                    {r.transferCount > 0 ? ` · transferred ${r.transferCount}×` : ""}
                  </p>
                </div>

                {r.pastDueSla && r.hoursPastSla != null ? (
                  <span className="tnum shrink-0 rounded-full border border-[var(--app-late-line)] bg-[var(--app-late-bg)] px-2.5 py-1 text-[11px] font-bold text-[var(--app-late-ink)]">
                    {r.hoursPastSla < 24
                      ? `${Math.round(r.hoursPastSla)}h late`
                      : `${Math.floor(r.hoursPastSla / 24)}d late`}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {attention.length > 25 ? (
          <div className="border-t border-[var(--app-line-soft)] px-5 py-3">
            <PanelLink href="/orders">
              {attention.length - 25} more — see every enquiry
            </PanelLink>
          </div>
        ) : null}
      </Panel>

      {/* ── What moved recently ──────────────────────────────────── */}
      <Panel>
        <PanelHeader title="Recent movement" caption="The last things that happened, across all divisions" />
        {isLoading ? (
          <div className="space-y-2 p-5">
            <PanelSkeleton className="h-12" />
            <PanelSkeleton className="h-12" />
          </div>
        ) : (data?.recentTimeline ?? []).length === 0 ? (
          <EmptyState icon={Clock} title="No activity recorded yet" />
        ) : (
          <ul className="divide-y divide-[var(--app-line-soft)]">
            {(data?.recentTimeline ?? []).slice(0, 12).map((e) => (
              <li key={e.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-5 py-3">
                <Link
                  href={`/orders/${e.order.id}`}
                  className="tnum text-xs font-bold text-[var(--app-brand)] hover:underline"
                >
                  {formatEnquiryNumberShort(e.order.orderNumber)}
                </Link>
                <span className="min-w-0 flex-1 text-sm text-[var(--app-ink-2)]">
                  <span className="font-semibold text-[var(--app-ink)]">{e.title}</span>
                  {e.actor ? ` by ${e.actor.name}` : ""} · {e.order.currentDivision.name}
                </span>
                <time dateTime={e.createdAt} className="shrink-0 text-xs text-[var(--app-ink-3)]">
                  {relativeTime(e.createdAt)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
