"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, FileText, Layers, Package, Users } from "lucide-react";
import { Panel, PanelHeader, PanelLink, PageHeader, PanelSkeleton } from "@/components/ui/panel";
import { StatTile } from "@/components/ui/stat-tile";
import { roleLabel } from "@/lib/roles";

const StatusDonut = dynamic(() => import("@/components/dashboard/charts").then((m) => m.StatusDonut), {
  ssr: false,
  loading: () => <div className="h-[180px] animate-pulse rounded-xl bg-[var(--app-surface-sunk)]" />,
});
const DivisionBars = dynamic(() => import("@/components/dashboard/charts").then((m) => m.DivisionBars), {
  ssr: false,
  loading: () => <div className="h-[200px] animate-pulse rounded-xl bg-[var(--app-surface-sunk)]" />,
});

const STATUS_LABEL: Record<string, string> = {
  PLACED: "Awaiting acceptance",
  IN_PROGRESS: "In progress",
  TRANSFERRED: "Transferred",
  COMPLETED: "Completed",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

type AdminStats = {
  ordersByStatus: { status: string; count: number }[];
  usersByRole: { role: string; count: number }[];
  totalOrders: number;
  totalDivisions: number;
  totalUsers: number;
  activeUsers: number;
  slaBreachesCount: number;
  recentAuditCount: number;
};

export default function AdminDashboardPage() {
  const { data: stats, isLoading } = useQuery<AdminStats>({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const res = await fetch("/api/admin/stats", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
    staleTime: 60_000,
  });

  const statusSplit = (stats?.ordersByStatus ?? [])
    .filter((s) => s.count > 0)
    .map((s) => ({ key: s.status, label: STATUS_LABEL[s.status] ?? s.status, count: s.count }));

  const roleBars = (stats?.usersByRole ?? []).map((r) => ({
    name: roleLabel(r.role as Parameters<typeof roleLabel>[0]),
    count: r.count,
  }));

  const inactiveUsers = stats ? stats.totalUsers - stats.activeUsers : 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Admin console"
        description="System-wide health: enquiry flow, people, divisions, and the audit trail."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Enquiries on record"
          value={stats?.totalOrders ?? 0}
          caption="Every enquiry ever submitted"
          icon={Package}
          tone="brand"
          loading={isLoading}
        />
        <StatTile
          label="People with accounts"
          value={stats?.totalUsers ?? 0}
          caption={
            inactiveUsers > 0
              ? `${stats?.activeUsers ?? 0} active · ${inactiveUsers} disabled`
              : "All accounts active"
          }
          icon={Users}
          tone="neutral"
          href="/admin/users"
          loading={isLoading}
        />
        <StatTile
          label="Divisions"
          value={stats?.totalDivisions ?? 0}
          caption="Where enquiries can be routed"
          icon={Layers}
          tone="neutral"
          href="/admin/divisions"
          loading={isLoading}
        />
        <StatTile
          label="Unresolved SLA breaches"
          value={stats?.slaBreachesCount ?? 0}
          caption={
            (stats?.slaBreachesCount ?? 0) > 0
              ? "Someone owes an explanation"
              : "Nothing has breached"
          }
          icon={AlertTriangle}
          tone={(stats?.slaBreachesCount ?? 0) > 0 ? "late" : "done"}
          loading={isLoading}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel>
          <PanelHeader
            title="Enquiries by status"
            caption="Where the whole book sits right now"
          />
          <div className="p-5">
            {isLoading ? (
              <PanelSkeleton className="h-[180px]" />
            ) : (
              <StatusDonut data={statusSplit} />
            )}
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title="People by role"
            caption="How the workforce is distributed"
            action={<PanelLink href="/admin/users">Manage users</PanelLink>}
          />
          <div className="p-5">
            {isLoading ? (
              <PanelSkeleton className="h-[200px]" />
            ) : (
              <DivisionBars data={roleBars} />
            )}
          </div>
        </Panel>
      </div>

      <Panel>
        <PanelHeader title="Audit trail" caption="Every recorded action across the system" />
        <div className="flex flex-wrap items-center gap-4 p-5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--app-brand-tint)]">
            <FileText className="h-5 w-5 text-[var(--app-brand)]" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="tnum text-2xl font-extrabold leading-none text-[var(--app-ink)]">
              {isLoading ? "—" : (stats?.recentAuditCount ?? 0).toLocaleString()}
            </p>
            <p className="mt-1 text-sm text-[var(--app-ink-2)]">
              entries recorded. Every acceptance, transfer, rejection and completion is logged with
              who did it and when.
            </p>
          </div>
          <Link
            href="/admin/activity"
            className="inline-flex h-10 shrink-0 items-center rounded-xl bg-[var(--app-ink)] px-4 text-sm font-semibold text-white hover:bg-black"
          >
            Open activity logs
          </Link>
        </div>
      </Panel>
    </div>
  );
}
