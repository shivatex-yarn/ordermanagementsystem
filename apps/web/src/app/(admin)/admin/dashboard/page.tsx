"use client";

import { useState } from "react";
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
};

async function fetchAdminStats() {
  const res = await fetch("/api/admin/stats", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch stats");
  return res.json();
}

async function fetchActivity(page = 1) {
  const res = await fetch(`/api/admin/activity?page=${page}&limit=15`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to fetch activity");
  return res.json();
}

export default function AdminDashboardPage() {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: fetchAdminStats,
  });
  const [activityPage, setActivityPage] = useState(1);
  const { data: activity, isLoading: activityLoading } = useQuery({
    queryKey: ["admin-activity", activityPage],
    queryFn: () => fetchActivity(activityPage),
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
          Process flow, metrics, and activity — Super Admin only.
        </p>
      </div>

      {/* Metrics */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Total Orders</CardTitle>
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
          <CardTitle>Process flow — Orders by stage</CardTitle>
          <p className="text-sm text-slate-500">
            At which stage orders currently are. Rejected and Completed are terminal stages.
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

      {/* Trigger events & activity logs — who modified/deleted, detailed actions */}
      <Card>
        <CardHeader>
          <CardTitle>Trigger events & activity logs</CardTitle>
          <p className="text-sm text-slate-500">
            Who performed each action, when, and on which order. Includes created, accepted, transferred, rejected, completed.
          </p>
        </CardHeader>
        <CardContent>
          {activityLoading ? (
            <div className="py-8 text-center text-slate-500">Loading activity...</div>
          ) : !activity?.logs?.length ? (
            <div className="py-8 text-center text-slate-500">No activity yet.</div>
          ) : (
            <>
              <div className="rounded-xl border border-slate-100 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/80">
                      <th className="text-left p-3 font-medium text-slate-700">Time</th>
                      <th className="text-left p-3 font-medium text-slate-700">Action</th>
                      <th className="text-left p-3 font-medium text-slate-700">Order</th>
                      <th className="text-left p-3 font-medium text-slate-700">Who</th>
                      <th className="text-left p-3 font-medium text-slate-700">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activity.logs.map((log: {
                      id: number;
                      action: string;
                      createdAt: string;
                      payload: unknown;
                      user: { name: string; email: string; role: string } | null;
                      order: { orderNumber: string; status: string } | null;
                    }) => (
                      <tr key={log.id} className="border-b border-slate-50">
                        <td className="p-3 text-slate-600">
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                        <td className="p-3 font-medium text-slate-900">{log.action}</td>
                        <td className="p-3">
                          {log.order ? `${log.order.orderNumber} (${log.order.status})` : "—"}
                        </td>
                        <td className="p-3 text-slate-600">
                          {log.user ? `${log.user.name} (${log.user.email}) — ${log.user.role}` : "System"}
                        </td>
                        <td className="p-3 text-slate-500 max-w-xs truncate">
                          {log.payload && typeof log.payload === "object"
                            ? JSON.stringify(log.payload).slice(0, 80) + "..."
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {activity.total > activity.limit && (
                <div className="flex justify-end gap-2 mt-4">
                  <button
                    type="button"
                    onClick={() => setActivityPage((p) => Math.max(1, p - 1))}
                    disabled={activityPage <= 1}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => setActivityPage((p) => p + 1)}
                    disabled={activityPage * activity.limit >= activity.total}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
