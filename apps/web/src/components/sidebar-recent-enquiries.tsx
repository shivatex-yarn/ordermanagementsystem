"use client";

/**
 * Compact "Recent enquiries" widget that lives inside the dashboard sidebar.
 * Shows 5 enquiries at a time (the API caps the list at limit=5) with Prev/Next
 * pagination. The query reuses the user's existing role-scoped /api/orders endpoint,
 * so Division Heads / Supervisors / ASMs see only their division, salespersons see
 * only their own, and MD / Admin / Accounts see everything.
 */

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Package } from "lucide-react";
import { cn } from "@/lib/utils";

type Row = {
  id: number;
  orderNumber: string;
  status: string;
  createdAt: string;
  companyName?: string | null;
  currentDivision?: { name: string } | null;
};

type ListResponse = { orders: Row[]; total: number; page: number; limit: number };

const STATUS_TONE: Record<string, string> = {
  PLACED: "bg-slate-900 text-white",
  IN_PROGRESS: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
  TRANSFERRED: "bg-blue-50 text-blue-700 ring-1 ring-blue-100",
  REJECTED: "bg-red-50 text-red-700 ring-1 ring-red-100",
  COMPLETED: "bg-slate-100 text-slate-700",
  CANCELLED: "bg-slate-100 text-slate-500",
};

export function SidebarRecentEnquiries({ collapsed }: { collapsed?: boolean }) {
  const [page, setPage] = useState(1);
  const pathname = usePathname();
  const { data, isLoading } = useQuery({
    queryKey: ["sidebar-recent-enquiries", page],
    queryFn: async () => {
      const res = await fetch(`/api/orders?page=${page}&limit=5`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return (await res.json()) as ListResponse;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  if (collapsed) return null;

  const rows = data?.orders ?? [];
  const total = data?.total ?? 0;
  const limit = data?.limit ?? 5;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="mt-1">
      <div className="flex items-center justify-between gap-2 px-3 pb-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Enquiry list</p>
        <Link href="/orders" className="text-[10px] font-medium text-slate-500 hover:text-slate-900">
          All →
        </Link>
      </div>
      {isLoading ? (
        <p className="px-3 py-2 text-xs text-slate-400">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="px-3 py-2 text-xs text-slate-400">No enquiries yet.</p>
      ) : (
        <ul className="space-y-0.5">
          {rows.map((r) => (
            <li key={r.id}>
              <Link
                href={`/orders/${r.id}`}
                className={cn(
                  "group flex items-center gap-2 rounded-lg px-3 py-2 text-xs transition-colors",
                  pathname === `/orders/${r.id}`
                    ? "bg-white text-slate-900 shadow-sm border border-slate-100"
                    : "text-slate-600 hover:bg-white/60 hover:text-slate-900"
                )}
              >
                <Package
                  className={cn(
                    "h-3.5 w-3.5 shrink-0",
                    pathname === `/orders/${r.id}` ? "text-slate-500" : "text-slate-400 group-hover:text-slate-500"
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-[11px] font-medium text-slate-900">
                    {r.orderNumber}
                  </p>
                  <p className="truncate text-[10px] text-slate-500">
                    {r.companyName ?? "—"}
                    {r.currentDivision?.name ? ` · ${r.currentDivision.name}` : ""}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium",
                    STATUS_TONE[r.status] ?? "bg-slate-100 text-slate-600"
                  )}
                >
                  {r.status.replace("_", " ")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {total > limit ? (
        <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-100 px-3 pt-2 text-[10px] text-slate-500">
          <span>
            {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 hover:bg-slate-50 disabled:opacity-40"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 hover:bg-slate-50 disabled:opacity-40"
              aria-label="Next page"
            >
              <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
