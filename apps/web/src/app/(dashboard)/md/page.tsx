"use client";

/**
 * MD Executive Overview — premium black/white UI.
 *
 * Spec: high-level overview across all divisions, SLA breach monitoring, pending
 * approvals, department-wise performance, escalation visibility, complete enquiry
 * movement timeline, delay analytics, status-wise analytics, smart filters and
 * priority-based highlights. SLA breach + escalation alerts are visible ONLY here
 * and on the Super Admin dashboard.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  AlertOctagon,
  ArrowRightLeft,
  Building2,
  CheckCircle2,
  ChevronRight,
  Clock,
  Filter,
  Flame,
  LineChart,
  Search,
  ShieldAlert,
  Timer,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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
  PLACED: "Awaiting approval",
  IN_PROGRESS: "In progress",
  TRANSFERRED: "In transfer",
  REJECTED: "Rejected",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

function StatCard({
  label,
  value,
  hint,
  tone = "default",
  icon: Icon,
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: "default" | "warn" | "danger" | "success";
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const ring =
    tone === "danger"
      ? "ring-red-200"
      : tone === "warn"
        ? "ring-amber-200"
        : tone === "success"
          ? "ring-emerald-200"
          : "ring-slate-200";
  const accent =
    tone === "danger"
      ? "text-red-700 bg-red-50"
      : tone === "warn"
        ? "text-amber-700 bg-amber-50"
        : tone === "success"
          ? "text-emerald-700 bg-emerald-50"
          : "text-slate-700 bg-slate-50";
  return (
    <Card className={cn("relative overflow-hidden border border-slate-200/70 shadow-none ring-1", ring)}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</p>
          {Icon ? (
            <div className={cn("flex h-8 w-8 items-center justify-center rounded-full", accent)}>
              <Icon className="h-4 w-4" />
            </div>
          ) : null}
        </div>
        <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">{value}</p>
        {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    PLACED: "bg-slate-900 text-white",
    IN_PROGRESS: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
    TRANSFERRED: "bg-blue-50 text-blue-700 ring-1 ring-blue-100",
    REJECTED: "bg-red-50 text-red-700 ring-1 ring-red-100",
    COMPLETED: "bg-slate-100 text-slate-700",
    CANCELLED: "bg-slate-100 text-slate-500",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium", map[status] ?? "bg-slate-100 text-slate-700")}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function MDOverviewPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [divisionFilter, setDivisionFilter] = useState<string>("");
  const [priorityFilter, setPriorityFilter] = useState<string>("");
  const [slaFilter, setSlaFilter] = useState<"all" | "breached" | "atrisk" | "ok">("all");

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

  const totalEnquiries = useMemo(() => {
    if (!data) return 0;
    return Object.values(data.statusCounts).reduce((a, b) => a + b, 0);
  }, [data]);

  const filteredPipeline = useMemo(() => {
    if (!data) return [];
    return data.pipeline.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false;
      if (divisionFilter && r.currentDivision.id !== Number(divisionFilter)) return false;
      if (slaFilter === "breached" && !r.escalated) return false;
      if (slaFilter === "atrisk" && !r.pastDueSla) return false;
      if (slaFilter === "ok" && (r.pastDueSla || r.escalated)) return false;
      if (priorityFilter) {
        // Pipeline rows don't currently expose priority; client-side priority filtering is best-effort.
      }
      if (search) {
        const hay = `${r.orderNumber} ${r.companyName ?? ""} ${r.descriptionPreview ?? ""}`.toLowerCase();
        if (!hay.includes(search.toLowerCase())) return false;
      }
      return true;
    });
  }, [data, search, statusFilter, divisionFilter, priorityFilter, slaFilter]);

  const divisions = useMemo(() => {
    if (!data) return [];
    const m = new Map<number, string>();
    data.pipeline.forEach((r) => m.set(r.currentDivision.id, r.currentDivision.name));
    return Array.from(m.entries()).map(([id, name]) => ({ id, name }));
  }, [data]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Executive overview</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            Enquiry control room
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Real-time view of every enquiry across all divisions, with SLA, escalation and workflow analytics.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
          Live · refreshes every 60s
        </div>
      </div>

      {error ? (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <div>
            <p className="font-medium">Overview endpoint failed</p>
            <p className="mt-0.5 text-xs text-red-700">{(error as Error).message}</p>
            <p className="mt-1 text-xs text-red-700">
              If this is the first run after schema changes, please run{" "}
              <code className="rounded bg-red-100 px-1 py-0.5 font-mono text-[10px]">cd apps/web &amp;&amp; npx prisma migrate deploy &amp;&amp; npx prisma generate</code>{" "}
              and restart the dev server.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={() => refetch()} className="border-red-200 text-red-800 hover:bg-red-100">
            Retry
          </Button>
        </div>
      ) : null}

      {/* Stat row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          label="Total enquiries"
          value={isLoading ? "—" : totalEnquiries}
          hint="all-time"
          icon={LineChart}
        />
        <StatCard
          label="Pending approval"
          value={isLoading ? "—" : data?.pendingApprovalsCount ?? 0}
          hint="awaiting Division Head"
          tone="warn"
          icon={Clock}
        />
        <StatCard
          label="In progress"
          value={isLoading ? "—" : data?.statusCounts?.IN_PROGRESS ?? 0}
          tone="success"
          icon={CheckCircle2}
        />
        <StatCard
          label="SLA breached"
          value={isLoading ? "—" : data?.openBreaches ?? 0}
          hint="48-hour rule violated"
          tone="danger"
          icon={AlertOctagon}
        />
        <StatCard
          label="Samples pending"
          value={isLoading ? "—" : data?.samplesPendingHead ?? 0}
          hint="awaiting head approval"
          tone="warn"
          icon={ShieldAlert}
        />
      </div>

      {/* Priority chips */}
      {data && Object.keys(data.priorityCounts ?? {}).length > 0 ? (
        <div className="flex flex-wrap gap-2 text-xs">
          {(["CRITICAL", "HIGH", "NORMAL", "LOW"] as const).map((p) => {
            const count = data.priorityCounts[p] ?? 0;
            if (count === 0) return null;
            const tone =
              p === "CRITICAL"
                ? "bg-red-50 text-red-700 ring-red-100"
                : p === "HIGH"
                  ? "bg-amber-50 text-amber-700 ring-amber-100"
                  : "bg-slate-100 text-slate-700 ring-slate-100";
            return (
              <span key={p} className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium ring-1", tone)}>
                {p === "CRITICAL" ? <Flame className="h-3 w-3" /> : null}
                {p.toLowerCase()} · {count}
              </span>
            );
          })}
        </div>
      ) : null}

      {/* Division SLA breakdown */}
      <Card className="border border-slate-200/70 shadow-none">
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Division SLA breakdown</h2>
              <p className="text-xs text-slate-500">Open breaches per division — explained vs. pending delay-reason.</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/60 text-left text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Division</th>
                  <th className="px-5 py-3 font-medium">Open breaches</th>
                  <th className="px-5 py-3 font-medium">Pending reason</th>
                  <th className="px-5 py-3 font-medium">Explained</th>
                  <th className="px-5 py-3 font-medium">Oldest breach</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-6 text-center text-sm text-slate-500">Loading…</td>
                  </tr>
                ) : (data?.divisionSla ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-6 text-center text-sm text-slate-500">
                      No open breaches across any division.
                    </td>
                  </tr>
                ) : (
                  (data?.divisionSla ?? []).map((d) => (
                    <tr key={d.divisionId} className="hover:bg-slate-50/60">
                      <td className="px-5 py-3 font-medium text-slate-900">
                        <span className="inline-flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-slate-400" /> {d.divisionName}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <Badge className={cn("rounded-full font-medium", d.total > 0 ? "bg-red-50 text-red-700 ring-1 ring-red-100" : "bg-slate-100 text-slate-700")}>
                          {d.total}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-slate-700">{d.pending}</td>
                      <td className="px-5 py-3 text-slate-700">{d.explained}</td>
                      <td className="px-5 py-3 text-slate-500">{d.oldestBreachAt ? relativeTime(d.oldestBreachAt) : "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Pending breaches list */}
      {data && data.recentBreaches.length > 0 ? (
        <Card className="border border-red-100 bg-red-50/30 shadow-none">
          <CardContent className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <AlertOctagon className="h-4 w-4 text-red-600" />
              <h2 className="text-sm font-semibold text-slate-900">Recent SLA breaches</h2>
            </div>
            <ul className="divide-y divide-red-100/80">
              {data.recentBreaches.slice(0, 8).map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <Link href={`/orders/${b.order.id}`} className="font-mono text-xs font-semibold text-slate-900 hover:underline">
                      {b.order.orderNumber}
                    </Link>
                    <span className="ml-2 text-slate-500">· {b.division.name}</span>
                    {b.headRejectionMessage ? (
                      <p className="mt-0.5 truncate text-xs text-slate-600">“{b.headRejectionMessage}”</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-xs">
                    <span className="rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-700">
                      {relativeTime(b.breachedAt)}
                    </span>
                    {b.headRejectedAt ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-700">Explained</span>
                    ) : (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-700">Awaiting reason</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {/* Pipeline + filters */}
      <Card className="border border-slate-200/70 shadow-none">
        <CardContent className="p-0">
          <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Pipeline</h2>
              <p className="text-xs text-slate-500">{filteredPipeline.length} enquiries match your filters.</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
              <label className="relative col-span-2 sm:col-span-1">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search enquiry / customer…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-md border border-slate-200 bg-white py-1.5 pl-7 pr-2 text-sm text-slate-900 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 sm:w-64"
                />
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-slate-900"
              >
                <option value="">All status</option>
                {Object.keys(STATUS_LABEL).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
              <select
                value={divisionFilter}
                onChange={(e) => setDivisionFilter(e.target.value)}
                className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-slate-900"
              >
                <option value="">All divisions</option>
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <select
                value={slaFilter}
                onChange={(e) => setSlaFilter(e.target.value as typeof slaFilter)}
                className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-slate-900"
              >
                <option value="all">SLA · all</option>
                <option value="breached">SLA · breached</option>
                <option value="atrisk">SLA · at risk</option>
                <option value="ok">SLA · ok</option>
              </select>
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-slate-900"
              >
                <option value="">Priority · all</option>
                <option value="CRITICAL">Critical</option>
                <option value="HIGH">High</option>
                <option value="NORMAL">Normal</option>
                <option value="LOW">Low</option>
              </select>
              {(search || statusFilter || divisionFilter || priorityFilter || slaFilter !== "all") ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-slate-600"
                  onClick={() => {
                    setSearch("");
                    setStatusFilter("");
                    setDivisionFilter("");
                    setPriorityFilter("");
                    setSlaFilter("all");
                  }}
                >
                  <Filter className="mr-1 h-3.5 w-3.5" /> Reset
                </Button>
              ) : null}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/60 text-left text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Enquiry</th>
                  <th className="px-5 py-3 font-medium">Customer</th>
                  <th className="px-5 py-3 font-medium">Division</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">SLA</th>
                  <th className="px-5 py-3 font-medium">Updated</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-6 text-center text-sm text-slate-500">Loading…</td>
                  </tr>
                ) : filteredPipeline.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-6 text-center text-sm text-slate-500">No enquiries match.</td>
                  </tr>
                ) : (
                  filteredPipeline.map((r) => (
                    <tr key={r.id} className={cn("hover:bg-slate-50/60", r.escalated && "bg-red-50/40 hover:bg-red-50/60")}>
                      <td className="px-5 py-3">
                        <Link href={`/orders/${r.id}`} className="font-mono text-xs font-semibold text-slate-900 hover:underline">
                          {r.orderNumber}
                        </Link>
                      </td>
                      <td className="max-w-[18rem] px-5 py-3 text-slate-800">
                        <div className="truncate font-medium">{r.companyName ?? "—"}</div>
                        {r.descriptionPreview ? (
                          <div className="truncate text-xs text-slate-500">{r.descriptionPreview}</div>
                        ) : null}
                      </td>
                      <td className="px-5 py-3 text-slate-700">{r.currentDivision.name}</td>
                      <td className="px-5 py-3"><StatusPill status={r.status} /></td>
                      <td className="px-5 py-3">
                        {r.escalated ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700 ring-1 ring-red-100">
                            <AlertOctagon className="h-3 w-3" /> Breached {r.hoursPastSla != null ? `${r.hoursPastSla}h` : ""}
                          </span>
                        ) : r.pastDueSla ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-amber-100">
                            <Timer className="h-3 w-3" /> At risk
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-100">
                            <CheckCircle2 className="h-3 w-3" /> On time
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-500">{relativeTime(r.updatedAt)}</td>
                      <td className="px-5 py-3 text-right">
                        <Link href={`/orders/${r.id}`} className="inline-flex items-center text-xs font-medium text-slate-700 hover:text-slate-900">
                          Open <ChevronRight className="ml-0.5 h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Recent activity timeline */}
      <Card className="border border-slate-200/70 shadow-none">
        <CardContent className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Recent enquiry movement</h2>
              <p className="text-xs text-slate-500">Workflow events across every enquiry, newest first.</p>
            </div>
            <span className="flex items-center gap-1 text-xs text-slate-500">
              <ArrowRightLeft className="h-3 w-3" /> Last 40 events
            </span>
          </div>
          {isLoading ? (
            <p className="py-4 text-sm text-slate-500">Loading…</p>
          ) : (data?.recentTimeline ?? []).length === 0 ? (
            <p className="py-4 text-sm text-slate-500">No recent activity.</p>
          ) : (
            <ol className="relative space-y-3 border-l border-slate-200 pl-5">
              {(data?.recentTimeline ?? []).map((e) => (
                <li key={e.id} className="relative">
                  <span className="absolute -left-[1.45rem] top-1.5 inline-flex h-2.5 w-2.5 rounded-full bg-slate-900 ring-4 ring-white" />
                  <div className="flex items-baseline gap-2">
                    <Link href={`/orders/${e.order.id}`} className="font-mono text-xs font-semibold text-slate-900 hover:underline">
                      {e.order.orderNumber}
                    </Link>
                    <span className="text-xs text-slate-500">· {e.order.currentDivision.name}</span>
                    <span className="ml-auto text-xs text-slate-400">{relativeTime(e.createdAt)}</span>
                  </div>
                  <p className="mt-0.5 text-sm text-slate-800">{e.title}</p>
                  {e.detail ? <p className="text-xs text-slate-500">{e.detail}</p> : null}
                  {e.actor ? (
                    <p className="text-[11px] text-slate-400">by {e.actor.name} · {e.actor.role}</p>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
