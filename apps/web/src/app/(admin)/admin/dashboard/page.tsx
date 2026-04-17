"use client";

import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const AdminDashboardCharts = dynamic(() => import("./admin-dashboard-charts").then((m) => m.AdminDashboardCharts), {
  ssr: false,
  loading: () => (
    <div className="space-y-6">
      <div className="h-80 animate-pulse rounded-xl border border-slate-100 bg-slate-50" />
      <div className="h-72 animate-pulse rounded-xl border border-slate-100 bg-slate-50" />
    </div>
  ),
});

const STATUS_COLORS: Record<string, string> = {
  PLACED: "#94a3b8",
  IN_PROGRESS: "#3b82f6",
  TRANSFERRED: "#f59e0b",
  REJECTED: "#ef4444",
  COMPLETED: "#22c55e",
  CANCELLED: "#78716c",
};

async function fetchAdminStats() {
  const res = await fetch("/api/admin/stats", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch stats");
  return res.json();
}

export default function AdminDashboardPage() {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: fetchAdminStats,
  });

  if (statsLoading || !stats) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-slate-900">Admin Dashboard</h1>
        <div className="animate-pulse h-64 bg-slate-100 rounded-xl" />
      </div>
    );
  }

  const barData = stats.ordersByStatus?.map((s: { status: string; count: number }) => ({
    name: s.status.replace("_", " "),
    count: s.count,
    fill: STATUS_COLORS[s.status] ?? "#94a3b8",
  })) ?? [];
  const pieData = barData.map((d: { name: string; count: number; fill: string }) => ({
    name: d.name,
    value: d.count,
    fill: d.fill,
  })).filter((d: { value: number }) => d.value > 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Admin Dashboard</h1>
        <p className="text-slate-500 mt-1">
          Enquiry flow, metrics, and activity — Super Admin only.
        </p>
      </div>

      {/* Metrics */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Total Enquiries</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold text-slate-900">{stats.totalOrders ?? 0}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Divisions</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold text-slate-900">{stats.totalDivisions ?? 0}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Open SLA Breaches</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold text-slate-900">{stats.slaBreachesCount ?? 0}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Activity Log Entries</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold text-slate-900">{stats.recentAuditCount ?? 0}</span>
          </CardContent>
        </Card>
      </div>

      <AdminDashboardCharts barData={barData} pieData={pieData} />

    </div>
  );
}
