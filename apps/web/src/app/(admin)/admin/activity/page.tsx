"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { ChevronLeft, ChevronRight, Download, FileText } from "lucide-react";
import { Panel, PageHeader, EmptyState } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status-pill";
import { roleLabel } from "@/lib/roles";
import { formatEnquiryNumberShort } from "@/lib/enquiry-display";

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

const PAGE_SIZE = 20;

async function fetchActivity(page = 1, limit = PAGE_SIZE): Promise<ActivityResponse> {
  const res = await fetch(`/api/admin/activity?page=${page}&limit=${limit}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to fetch activity");
  return res.json();
}

function formatPayload(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "—";
  const entries = Object.entries(payload as Record<string, unknown>)
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => `${humanKey(k)}: ${String(v)}`);
  return entries.length ? entries.join(" · ") : "—";
}

/** `fromDivisionId` reads better as "From division". */
function humanKey(key: string): string {
  const spaced = key.replace(/([A-Z])/g, " $1").replace(/\bId\b/g, "").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** `OrderTransferred` reads better as "Order transferred". */
function humanAction(action: string): string {
  const spaced = action.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
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
        Action: humanAction(log.action),
        Enquiry: log.order ? `${log.order.orderNumber} (${log.order.status})` : "—",
        Who: log.user
          ? `${log.user.name} (${log.user.email}) - ${roleLabel(log.user.role as Parameters<typeof roleLabel>[0])}`
          : "System",
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
    <div className="space-y-5">
      <PageHeader
        title="Activity logs"
        description="Every recorded action — who did it, when, and on which enquiry."
      >
        <button
          type="button"
          onClick={handleExportExcel}
          disabled={isExporting}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--app-line)] bg-white px-3.5 text-sm font-semibold text-[var(--app-ink-2)] hover:bg-[var(--app-surface-sunk)] disabled:opacity-60"
        >
          <Download className="h-4 w-4" aria-hidden />
          {isExporting ? "Exporting…" : "Download Excel"}
        </button>
      </PageHeader>

      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--app-line-soft)] px-5 py-3.5">
          <p className="text-sm font-semibold text-[var(--app-ink-2)]">
            {isLoading ? (
              "Loading…"
            ) : (
              <>
                <span className="tnum font-extrabold text-[var(--app-ink)]">
                  {(data?.total ?? 0).toLocaleString()}
                </span>{" "}
                entries
              </>
            )}
          </p>
          {totalPages > 1 ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Previous page"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--app-line)] text-[var(--app-ink-2)] disabled:opacity-40 hover:enabled:bg-[var(--app-surface-sunk)]"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </button>
              <span className="tnum text-xs font-semibold text-[var(--app-ink-2)]">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                aria-label="Next page"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--app-line)] text-[var(--app-ink-2)] disabled:opacity-40 hover:enabled:bg-[var(--app-surface-sunk)]"
              >
                <ChevronRight className="h-4 w-4" aria-hidden />
              </button>
            </div>
          ) : null}
        </div>

        {isLoading ? (
          <div className="space-y-2 p-5">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-xl bg-[var(--app-surface-sunk)]" />
            ))}
          </div>
        ) : !data?.logs?.length ? (
          <EmptyState
            icon={FileText}
            title="No activity recorded yet"
            description="Actions on enquiries will appear here as people work."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-left">
              <thead>
                <tr className="border-b border-[var(--app-line-soft)] bg-[var(--app-surface-sunk)]">
                  <th scope="col" className="px-5 py-2.5 text-[11px] font-bold uppercase tracking-wide text-[var(--app-ink-3)]">
                    When
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-[var(--app-ink-3)]">
                    Action
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-[var(--app-ink-3)]">
                    Enquiry
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-[var(--app-ink-3)]">
                    Who
                  </th>
                  <th scope="col" className="px-5 py-2.5 text-[11px] font-bold uppercase tracking-wide text-[var(--app-ink-3)]">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--app-line-soft)]">
                {data.logs.map((log) => (
                  <tr key={log.id} className="align-top hover:bg-[var(--app-brand-tint)]/30">
                    <td className="tnum whitespace-nowrap px-5 py-3 text-xs text-[var(--app-ink-2)]">
                      {new Date(log.createdAt).toLocaleString(undefined, {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-sm font-bold text-[var(--app-ink)]">
                      {humanAction(log.action)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      {log.order ? (
                        <span className="flex flex-col gap-1">
                          <span className="tnum text-xs font-semibold text-[var(--app-ink-2)]">
                            {formatEnquiryNumberShort(log.order.orderNumber)}
                          </span>
                          <StatusPill status={log.order.status} size="sm" />
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--app-ink-3)]">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {log.user ? (
                        <span className="block">
                          <span className="block text-sm font-semibold text-[var(--app-ink)]">
                            {log.user.name}
                          </span>
                          <span className="block text-xs text-[var(--app-ink-3)]">
                            {roleLabel(log.user.role as Parameters<typeof roleLabel>[0])}
                          </span>
                        </span>
                      ) : (
                        <span className="text-xs font-semibold text-[var(--app-ink-3)]">System</span>
                      )}
                    </td>
                    <td
                      className="max-w-sm truncate px-5 py-3 text-xs text-[var(--app-ink-3)]"
                      title={formatPayload(log.payload)}
                    >
                      {formatPayload(log.payload)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
