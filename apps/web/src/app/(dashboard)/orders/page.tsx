"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Download, Package } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import type { EnquiryPeriodFilter } from "@/lib/date-period";
import { PERIOD_LABELS } from "@/lib/date-period";
import { formatEnquiryNumber } from "@/lib/enquiry-display";
import { downloadEnquiriesExcel, fetchAllOrdersForExport } from "@/lib/enquiry-export";
import { userMayCreateEnquiry } from "@/lib/enquiry-access";

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "success" | "warning"> = {
  PLACED: "secondary",
  IN_PROGRESS: "default",
  TRANSFERRED: "warning",
  REJECTED: "destructive",
  COMPLETED: "success",
  CANCELLED: "secondary",
};

async function fetchOrders(page: number, period: EnquiryPeriodFilter) {
  const q = period ? `&period=${encodeURIComponent(period)}` : "";
  const res = await fetch(`/api/orders?page=${page}&limit=5${q}`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch enquiries");
  return res.json();
}

export default function OrdersPage() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [period, setPeriod] = useState<EnquiryPeriodFilter>("");
  const [divisionId, setDivisionId] = useState("");
  const [exporting, setExporting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["orders", page, period, divisionId],
    queryFn: async () => {
      const q = period ? `&period=${encodeURIComponent(period)}` : "";
      const div = divisionId ? `&divisionId=${encodeURIComponent(divisionId)}` : "";
      const res = await fetch(`/api/orders?page=${page}&limit=5${q}${div}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch enquiries");
      return res.json();
    },
    staleTime: 45_000,
    enabled: Boolean(user),
  });

  const isAccountsView = user?.role === "ACCOUNTS";
  const canCreate = Boolean(user && userMayCreateEnquiry(user.role) && !isAccountsView);
  const hideDivision = user?.role === "MANAGER";

  const { data: divisionsData } = useQuery({
    queryKey: ["divisions", "orders-filter"],
    queryFn: async () => {
      const res = await fetch("/api/divisions", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load divisions");
      return res.json() as Promise<{ divisions: { id: number; name: string }[] }>;
    },
    enabled: Boolean(user && isAccountsView),
    staleTime: 5 * 60_000,
  });
  const divisions = divisionsData?.divisions ?? [];

  const handleExport = async () => {
    setExporting(true);
    try {
      const rows = await fetchAllOrdersForExport({ period, divisionId: divisionId || undefined });
      const label =
        PERIOD_LABELS.find((p) => p.value === period)?.label?.toLowerCase().replace(/\s+/g, "-") ?? "all";
      downloadEnquiriesExcel(rows, label, hideDivision);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Enquiries</h1>
          <p className="mt-0.5 text-sm text-slate-500">Manage and track all enquiries across your divisions.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Period</span>
            <Select
              value={period || "all"}
              onValueChange={(v) => {
                setPeriod(v === "all" ? "" : (v as EnquiryPeriodFilter));
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full min-w-0 sm:w-[160px]">
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
          {isAccountsView ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-600">Division</span>
              <Select
                value={divisionId || "all"}
                onValueChange={(v) => {
                  setDivisionId(v === "all" ? "" : v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-full min-w-0 sm:w-[200px]">
                  <SelectValue placeholder="Division" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All divisions</SelectItem>
                  {divisions.map((d) => (
                    <SelectItem key={d.id} value={String(d.id)}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={exporting}
            onClick={() => void handleExport()}
          >
            <Download className="h-4 w-4 mr-2" />
            {exporting ? "Preparing…" : "Download Excel"}
          </Button>
          {canCreate && (
            <Button asChild>
              <Link href="/orders/new">
                <Plus className="h-4 w-4 mr-2" />
                New enquiry
              </Link>
            </Button>
          )}
        </div>
      </div>
      <Card className="overflow-hidden border border-slate-200 shadow-sm">
        <CardHeader className="border-b border-slate-100 bg-slate-50/60 px-5 py-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold text-slate-800">All enquiries</CardTitle>
            {data?.total ? (
              <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
                {data.total} total
              </span>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-0 divide-y divide-slate-100">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-4 px-5 py-4">
                  <div className="h-9 w-9 animate-pulse rounded-lg bg-slate-100" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-40 animate-pulse rounded bg-slate-100" />
                    <div className="h-3 w-64 animate-pulse rounded bg-slate-100" />
                  </div>
                  <div className="h-6 w-20 animate-pulse rounded-full bg-slate-100" />
                </div>
              ))}
            </div>
          ) : !data?.orders?.length ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                <Package className="h-6 w-6 text-slate-400" />
              </div>
              <p className="text-sm font-medium text-slate-600">No enquiries yet</p>
              <p className="text-xs text-slate-400">New enquiries will appear here once submitted.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {data.orders.map(
                (order: {
                  id: number;
                  orderNumber: string;
                  status: string;
                  currentDivision: { name: string };
                  createdAt: string;
                  createdBy?: { name: string; email: string };
                }) => {
                  const statusColors: Record<string, string> = {
                    PLACED: "bg-slate-400",
                    IN_PROGRESS: "bg-blue-500",
                    TRANSFERRED: "bg-amber-500",
                    REJECTED: "bg-red-500",
                    COMPLETED: "bg-emerald-500",
                    CANCELLED: "bg-stone-400",
                  };
                  return (
                    <Link
                      key={order.id}
                      href={`/orders/${order.id}`}
                      className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-indigo-50/40"
                    >
                      <div className={`h-10 w-1 shrink-0 rounded-full ${statusColors[order.status] ?? "bg-slate-300"}`} />
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2">
                          <span className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 font-mono text-xs font-semibold text-indigo-800">
                            {formatEnquiryNumber(order.orderNumber)}
                          </span>
                          {!hideDivision && order.currentDivision?.name ? (
                            <span className="text-xs font-medium text-slate-500">
                              {order.currentDivision.name}
                            </span>
                          ) : null}
                        </p>
                        <p className="mt-1 truncate text-xs text-slate-500">
                          {order.createdBy?.name ? (
                            <>
                              <span className="font-medium text-slate-700">{order.createdBy.name}</span>
                              <span className="mx-1 text-slate-300">·</span>
                            </>
                          ) : null}
                          <time dateTime={order.createdAt} suppressHydrationWarning>
                            {new Date(order.createdAt).toLocaleString()}
                          </time>
                        </p>
                      </div>
                      <Badge variant={statusVariant[order.status] ?? "secondary"} className="shrink-0 text-[11px] font-semibold">
                        {order.status.replace("_", " ")}
                      </Badge>
                    </Link>
                  );
                }
              )}
              {data.total > data.limit && (
                <div className="flex items-center justify-between gap-2 bg-slate-50/60 px-5 py-3">
                  <span className="text-xs text-slate-500">
                    Showing page {page} of {Math.max(1, Math.ceil(data.total / data.limit))} · {data.total} total
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      disabled={page * data.limit >= data.total}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
