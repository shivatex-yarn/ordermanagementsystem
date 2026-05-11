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
import { Plus, Download } from "lucide-react";
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
  const [exporting, setExporting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["orders", page, period],
    queryFn: () => fetchOrders(page, period),
    staleTime: 45_000,
    enabled: Boolean(user),
  });

  const canCreate = Boolean(user && userMayCreateEnquiry(user.role));
  const hideDivision = user?.role === "MANAGER";

  const handleExport = async () => {
    setExporting(true);
    try {
      const rows = await fetchAllOrdersForExport({ period });
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
        <h1 className="text-2xl font-bold tracking-tight">Enquiries</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-600">Period</span>
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
      <Card>
        <CardHeader>
          <CardTitle>All enquiries</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-slate-500">Loading...</div>
          ) : !data?.orders?.length ? (
            <div className="py-8 text-center text-slate-500">No enquiries yet.</div>
          ) : (
            <div className="space-y-4">
              {data.orders.map(
                (order: {
                  id: number;
                  orderNumber: string;
                  status: string;
                  currentDivision: { name: string };
                  createdAt: string;
                  createdBy?: { name: string; email: string };
                }) => (
                  <Link
                    key={order.id}
                    href={`/orders/${order.id}`}
                    className="flex flex-col gap-3 rounded-lg border-2 border-slate-300/70 p-4 shadow-sm transition-colors hover:border-indigo-300/60 hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                  >
                    <div>
                      <p className="inline-flex max-w-full flex-wrap items-center gap-2">
                        <span className="rounded-md border-2 border-indigo-400/70 bg-indigo-50 px-2 py-0.5 font-mono text-sm font-semibold text-indigo-950 ring-1 ring-indigo-200/70">
                          {formatEnquiryNumber(order.orderNumber)}
                        </span>
                      </p>
                      <p className="text-sm text-slate-500">
                        {order.createdBy?.name ? (
                          <>
                            <span className="text-slate-500">Raised by </span>
                            <span className="inline-block rounded-md bg-indigo-50 px-2 py-0.5 font-semibold text-indigo-950 ring-1 ring-indigo-200/70">
                              {order.createdBy.name}
                            </span>
                            <span className="text-slate-500">
                              {" "}
                              ·{" "}
                              <time dateTime={order.createdAt} suppressHydrationWarning>
                                {new Date(order.createdAt).toLocaleString()}
                              </time>
                            </span>
                          </>
                        ) : (
                          <time dateTime={order.createdAt} suppressHydrationWarning>
                            {new Date(order.createdAt).toLocaleString()}
                          </time>
                        )}
                        {!hideDivision ? (
                          <>
                            {" "}
                            · {order.currentDivision?.name}
                          </>
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
                <div className="flex justify-center items-center gap-2 pt-4">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    Previous
                  </Button>
                  <span className="text-sm text-slate-600 px-2">
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
