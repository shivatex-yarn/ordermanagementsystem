"use client";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
      <div className="grid gap-4 md:grid-cols-4">
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

      {/* Workflow: where the process stops */}
      <Card>
        <CardHeader>
          <CardTitle>Process flow — Enquiries by stage</CardTitle>
          <p className="text-sm text-slate-500">
            At which stage enquiries currently are. Rejected and Completed are terminal stages.
          </p>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 12 }} />
                <YAxis tick={{ fill: "#64748b", fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#fff", border: "1px solid #e2e8f0", borderRadius: 8 }}
                  labelStyle={{ color: "#0f172a" }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {barData.map((_: unknown, index: number) => (
                    <Cell key={index} fill={barData[index]?.fill ?? "#94a3b8"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Workflow stages breakdown (pie) */}
      {pieData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Stage distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={2}
                    dataKey="value"
                    nameKey="name"
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {pieData.map((entry: { fill: string }, index: number) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

    </div>
  );
}
