"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ActivityLog = {
  id: number;
  action: string;
  createdAt: string;
  payload: unknown;
  user: { name: string; email: string; role: string } | null;
  order: { orderNumber: string; status: string } | null;
};

type ActivityResponse = {
  logs: ActivityLog[];
  total: number;
  page: number;
  limit: number;
};

const PAGE_SIZE = 10;

async function fetchActivity(page = 1, limit = PAGE_SIZE): Promise<ActivityResponse> {
  const res = await fetch(`/api/admin/activity?page=${page}&limit=${limit}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to fetch activity");
  return res.json();
}

function formatPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") return "—";
  return JSON.stringify(payload);
}

export default function AdminActivityPage() {
  const [page, setPage] = useState(1);
  const [isExporting, setIsExporting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-activity-page", page],
    queryFn: () => fetchActivity(page, PAGE_SIZE),
  });

  const totalPages = useMemo(() => {
    if (!data?.total) return 1;
    return Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  }, [data?.total]);

  async function handleExportExcel() {
    setIsExporting(true);
    try {
      const first = await fetchActivity(1, 100);
      const pages = Math.max(1, Math.ceil(first.total / 100));
      let allLogs = [...first.logs];

      for (let p = 2; p <= pages; p += 1) {
        const next = await fetchActivity(p, 100);
        allLogs = allLogs.concat(next.logs);
      }

      const rows = allLogs.map((log) => ({
        Time: new Date(log.createdAt).toLocaleString(),
        Action: log.action,
        Enquiry: log.order ? `${log.order.orderNumber} (${log.order.status})` : "—",
        Who: log.user ? `${log.user.name} (${log.user.email}) - ${log.user.role}` : "System",
        Details: formatPayload(log.payload),
      }));

      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Activity Logs");
      XLSX.writeFile(workbook, `activity-logs-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Trigger events &amp; activity logs</h1>
          <p className="mt-1 text-sm text-slate-500">
            Who performed each action, when, and on which enquiry.
          </p>
        </div>
        <Button type="button" onClick={handleExportExcel} disabled={isExporting} className="gap-2 self-start sm:self-auto">
          <Download className="h-4 w-4" />
          {isExporting ? "Exporting..." : "Download Excel"}
        </Button>
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <FileText className="h-4 w-4 text-slate-600" />
            Activity timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-10 text-center text-sm text-slate-500">Loading activity logs...</div>
          ) : !data?.logs?.length ? (
            <div className="py-10 text-center text-sm text-slate-500">No activity yet.</div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr className="border-b border-slate-200">
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Time</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Action</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Enquiry</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Who</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Details</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {data.logs.map((log) => (
                      <tr key={log.id} className="border-b border-slate-100 last:border-b-0">
                        <td className="px-4 py-3 text-slate-600">{new Date(log.createdAt).toLocaleString()}</td>
                        <td className="px-4 py-3 font-medium text-slate-900">{log.action}</td>
                        <td className="px-4 py-3 text-slate-700">
                          {log.order ? `${log.order.orderNumber} (${log.order.status})` : "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {log.user ? `${log.user.name} (${log.user.email}) - ${log.user.role}` : "System"}
                        </td>
                        <td className="max-w-sm truncate px-4 py-3 text-slate-500" title={formatPayload(log.payload)}>
                          {formatPayload(log.payload)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <p className="text-sm text-slate-500">
                  Page {page} of {totalPages} ({data.total} records)
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                    disabled={page <= 1}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                    disabled={page >= totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
