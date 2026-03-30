"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Package, AlertTriangle, CheckCircle, Download } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import type { EnquiryPeriodFilter } from "@/lib/date-period";
import { PERIOD_LABELS } from "@/lib/date-period";
import { formatEnquiryNumber } from "@/lib/enquiry-display";
import { downloadEnquiriesExcel, fetchAllOrdersForExport } from "@/lib/enquiry-export";

const STATUS_COLORS: Record<string, string> = {
  PLACED: "#94a3b8",
  IN_PROGRESS: "#3b82f6",
  TRANSFERRED: "#f59e0b",
  REJECTED: "#ef4444",
  COMPLETED: "#22c55e",
  CANCELLED: "#78716c",
};

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "success" | "warning"> = {
  PLACED: "secondary",
  IN_PROGRESS: "default",
  TRANSFERRED: "warning",
  REJECTED: "destructive",
  COMPLETED: "success",
  CANCELLED: "secondary",
};

function buildOrdersQuery(period: EnquiryPeriodFilter, dateFrom: string, dateTo: string): string {
  const useCustom = Boolean(dateFrom.trim() && dateTo.trim());
  if (useCustom) {
    return `&from=${encodeURIComponent(dateFrom.trim())}&to=${encodeURIComponent(dateTo.trim())}`;
  }
  if (period) {
    return `&period=${encodeURIComponent(period)}`;
  }
  return "";
}

const SLA_ROLES = new Set(["SUPER_ADMIN", "MANAGING_DIRECTOR"]);

async function fetchDashboard(
  period: EnquiryPeriodFilter,
  page: number,
  dateFrom: string,
  dateTo: string,
  role: string
) {
  const q = buildOrdersQuery(period, dateFrom, dateTo);
  const ordersUrl = `/api/orders?page=${page}&limit=5&stats=1${q}`;
  if (!SLA_ROLES.has(role)) {
    const pipeRes = await fetch(ordersUrl, { credentials: "include" });
    const pipe = pipeRes.ok
      ? await pipeRes.json()
      : { total: 0, orders: [], statusCounts: {}, page: 1, limit: 5 };
    return { ...pipe, slaBreaches: 0, enquiriesAtRisk: 0 };
  }
  const [pipeRes, slaRes] = await Promise.all([
    fetch(ordersUrl, { credentials: "include" }),
    fetch("/api/sla", { credentials: "include" }),
  ]);
  const pipe = pipeRes.ok
    ? await pipeRes.json()
    : { total: 0, orders: [], statusCounts: {}, page: 1, limit: 5 };
  const slaData = slaRes.ok ? await slaRes.json() : { breaches: [], ordersAtRisk: [] };
  return {
    ...pipe,
    slaBreaches: slaData.breaches?.length ?? 0,
    enquiriesAtRisk: slaData.ordersAtRisk?.length ?? 0,
  };
}

export default function DashboardPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [period, setPeriod] = useState<EnquiryPeriodFilter>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  const useCustomRange = Boolean(dateFrom.trim() && dateTo.trim());

  const { data, isLoading: dashboardLoading } = useQuery({
    queryKey: ["dashboard", period, page, dateFrom, dateTo, user?.role],
    queryFn: () => fetchDashboard(period, page, dateFrom, dateTo, user?.role ?? "USER"),
    staleTime: 45_000,
    enabled: !!user,
  });
  const isLoading = authLoading || dashboardLoading;

  const hideDivision = user?.role === "MANAGER";

  const handleExport = async () => {
    setExporting(true);
    try {
      const rows = await fetchAllOrdersForExport({
        period: useCustomRange ? "" : period,
        from: dateFrom.trim() || undefined,
        to: dateTo.trim() || undefined,
      });
      const label = useCustomRange
        ? `custom-${dateFrom.trim()}-to-${dateTo.trim()}`
        : PERIOD_LABELS.find((p) => p.value === period)?.label?.toLowerCase().replace(/\s+/g, "-") ?? "all";
      downloadEnquiriesExcel(rows, label, hideDivision);
    } finally {
      setExporting(false);
    }
  };

  const statusCounts = data?.statusCounts ?? {};
  const pieData = Object.entries(statusCounts)
    .map(([name, value]) => ({
      name: name.replace(/_/g, " "),
      value: value as number,
      fill: STATUS_COLORS[name] ?? "#94a3b8",
    }))
    .filter((d) => d.value > 0);

  const barData = pieData.map((d) => ({ ...d, count: d.value }));

  if (isLoading || !data) {
    return (
      <div className="space-y-8">
        <div className="h-8 w-48 bg-slate-200 rounded animate-pulse" />
        <div className="grid gap-6 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="h-4 w-32 bg-slate-200 rounded" />
              </CardHeader>
              <CardContent>
                <div className="h-8 w-16 bg-slate-200 rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const metricCards = [
    { title: "Total enquiries", value: data.total, icon: Package },
    { title: "SLA breaches", value: data.slaBreaches, icon: AlertTriangle, alert: data.slaBreaches > 0 },
    {
      title: "Enquiries at risk",
      value: data.enquiriesAtRisk,
      icon: CheckCircle,
      alert: data.enquiriesAtRisk > 0,
    },
  ];

  const pipelineSubtitle =
    user?.role === "USER"
      ? "Enquiries you raised (most recent first)."
      : hideDivision
        ? "Enquiries for your division (most recent first)."
        : "Scoped to your account and divisions.";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-slate-500 mt-1">
          Welcome back, {user?.name}. Here&apos;s an overview of your enquiries and SLA.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {metricCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.title} className={"alert" in card && card.alert ? "border-amber-200" : ""}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-slate-500">{card.title}</CardTitle>
                <Icon className="h-4 w-4 text-slate-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{card.value}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="border-slate-200/90 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters</CardTitle>
          <p className="text-sm text-slate-500 font-normal">
            Use a quick period <span className="text-slate-400">or</span> a custom from/to range. Custom range
            applies when both dates are set.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-slate-500">Quick period</Label>
              <Select
                value={period || "all"}
                disabled={useCustomRange}
                onValueChange={(v) => {
                  setDateFrom("");
                  setDateTo("");
                  setPeriod(v === "all" ? "" : (v as EnquiryPeriodFilter));
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Period" />
                </SelectTrigger>
                <SelectContent>
                  {PERIOD_LABELS.map((p) => (
                    <SelectItem key={p.value || "all"} value={p.value || "all"}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wide text-slate-500">From date</Label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => {
                    const v = e.target.value;
                    setDateFrom(v);
                    if (v && dateTo) setPeriod("");
                    setPage(1);
                  }}
                  className="flex h-9 w-full min-w-40 rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-sm sm:w-40"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wide text-slate-500">To date</Label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => {
                    const v = e.target.value;
                    setDateTo(v);
                    if (dateFrom && v) setPeriod("");
                    setPage(1);
                  }}
                  className="flex h-9 w-full min-w-40 rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-sm sm:w-40"
                />
              </div>
              {(dateFrom || dateTo) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-slate-600"
                  onClick={() => {
                    setDateFrom("");
                    setDateTo("");
                    setPage(1);
                  }}
                >
                  Clear dates
                </Button>
              )}
            </div>

            <div className="lg:ml-auto">
              <Button type="button" variant="outline" size="sm" disabled={exporting} onClick={() => void handleExport()}>
                <Download className="h-4 w-4 mr-2" />
                {exporting ? "Preparing…" : "Download Excel"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {pieData.length > 0 ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Outcome mix</CardTitle>
              <p className="text-sm text-slate-500 font-normal">
                {useCustomRange
                  ? `Enquiry counts by status for ${dateFrom} → ${dateTo}.`
                  : "Enquiry counts by status for the selected period."}
              </p>
            </CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={88} label>
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Outcomes by status</CardTitle>
            </CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {barData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-slate-500 text-sm">
            No enquiries in this view to chart.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Enquiry pipeline</CardTitle>
            <p className="text-sm text-slate-500 font-normal mt-1">{pipelineSubtitle}</p>
          </div>
        </CardHeader>
        <CardContent>
          {!data.orders?.length ? (
            <div className="py-8 text-center text-slate-500">No enquiries in this view.</div>
          ) : (
            <div className="space-y-4">
              {data.orders.map(
                (order: {
                  id: number;
                  orderNumber: string;
                  status: string;
                  createdAt: string;
                  createdBy?: { name: string };
                  currentDivision?: { name: string };
                }) => (
                  <Link
                    key={order.id}
                    href={`/orders/${order.id}`}
                    className="flex items-center justify-between rounded-lg border border-slate-100 p-4 hover:bg-slate-50 transition-colors"
                  >
                    <div>
                      <p className="font-medium">{formatEnquiryNumber(order.orderNumber)}</p>
                      <p className="text-sm text-slate-500">
                        {order.createdBy?.name ? (
                          <>
                            <span className="text-slate-500">Raised by </span>
                            <span className="inline-block rounded-md bg-indigo-50 px-2 py-0.5 font-semibold text-indigo-950 ring-1 ring-indigo-200/70">
                              {order.createdBy.name}
                            </span>
                            <span className="text-slate-500">
                              {" "}
                              · {new Date(order.createdAt).toLocaleString()}
                            </span>
                          </>
                        ) : (
                          new Date(order.createdAt).toLocaleString()
                        )}
                        {!hideDivision && order.currentDivision?.name ? (
                          <> · {order.currentDivision.name}</>
                        ) : null}
                      </p>
                    </div>
                    <Badge variant={statusVariant[order.status] ?? "secondary"}>
                      {order.status.replace("_", " ")}
                    </Badge>
                  </Link>
                )
              )}
              {data.total > data.limit && (
                <div className="flex justify-center gap-2 pt-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    Previous
                  </Button>
                  <span className="text-sm text-slate-600 self-center px-2">
                    Page {page} of {Math.max(1, Math.ceil(data.total / data.limit))}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page * data.limit >= data.total}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
