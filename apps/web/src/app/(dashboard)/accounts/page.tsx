"use client";

/**
 * Accounts Team dashboard — read-only across all divisions.
 *
 * Spec: separate dedicated dashboard, access to all division enquiries, financial
 * approval visibility, commercial tracking + reporting, customer & enquiry financial
 * summaries. Visible to ACCOUNTS, SUPER_ADMIN, MANAGING_DIRECTOR.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, ChevronLeft, ChevronRight, Search, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AccountsOverview = {
  statusCounts: Record<string, number>;
  totalCustomers: number;
  openCount: number;
  byDivision: Array<{
    divisionId: number;
    divisionName: string;
    placed: number;
    inProgress: number;
    completed: number;
    rejected: number;
    total: number;
  }>;
  recent: Array<{
    id: number;
    orderNumber: string;
    companyName: string | null;
    status: string;
    priority: string;
    productKind: string | null;
    createdAt: string;
    updatedAt: string;
    currentDivision: { id: number; name: string };
    createdBy: { id: number; name: string };
  }>;
};

function StatCard({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <Card className="border border-slate-200/70 shadow-none ring-1 ring-slate-200">
      <CardContent className="p-5">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</p>
        <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">{value}</p>
        {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

const PAGE_SIZE = 5;

export default function AccountsPage() {
  const [search, setSearch] = useState("");
  const [divisionId, setDivisionId] = useState<string>("");
  const [page, setPage] = useState(1);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["accounts-overview"],
    queryFn: async () => {
      const res = await fetch("/api/accounts/overview", { credentials: "include" });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `Accounts endpoint returned ${res.status}`);
      }
      return (await res.json()) as AccountsOverview;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 1,
    retryDelay: 1000,
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.recent.filter((r) => {
      if (divisionId && r.currentDivision.id !== Number(divisionId)) return false;
      if (search) {
        const hay = `${r.orderNumber} ${r.companyName ?? ""}`.toLowerCase();
        if (!hay.includes(search.toLowerCase())) return false;
      }
      return true;
    });
  }, [data, divisionId, search]);

  /** Pagination */
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // Reset to first page whenever filters or data change.
  useEffect(() => {
    setPage(1);
  }, [search, divisionId, filtered.length]);
  const safePage = Math.min(page, totalPages);
  const startIdx = (safePage - 1) * PAGE_SIZE;
  const pageRows = filtered.slice(startIdx, startIdx + PAGE_SIZE);

  const totals = data
    ? Object.values(data.statusCounts).reduce((a, b) => a + b, 0)
    : 0;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Accounts</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          Commercial & customer overview
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          Cross-division enquiry visibility, customer-level rollups, and order pipeline for the accounts team.
        </p>
      </div>

      {error ? (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <div>
            <p className="font-medium">Accounts endpoint failed</p>
            <p className="mt-0.5 text-xs text-red-700">{(error as Error).message}</p>
            <p className="mt-1 text-xs text-red-700">
              If this is the first run after schema changes, please run{" "}
              <code className="rounded bg-red-100 px-1 py-0.5 font-mono text-[10px]">cd apps/web &amp;&amp; npx prisma migrate deploy &amp;&amp; npx prisma generate</code>{" "}
              and restart the dev server.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={() => refetch()} className="border-red-200 text-red-800 hover:bg-red-100">
            Retry
          </Button>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total enquiries" value={isLoading ? "—" : totals} />
        <StatCard label="Open" value={isLoading ? "—" : data?.openCount ?? 0} hint="Placed, in progress, in transfer" />
        <StatCard label="Completed" value={isLoading ? "—" : data?.statusCounts?.COMPLETED ?? 0} />
        <StatCard label="Customers" value={isLoading ? "—" : data?.totalCustomers ?? 0} />
      </div>

      <Card className="border border-slate-200/70 shadow-none">
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Division performance</h2>
              <p className="text-xs text-slate-500">Status mix per division.</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/60 text-left text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Division</th>
                  <th className="px-5 py-3 font-medium">Placed</th>
                  <th className="px-5 py-3 font-medium">In progress</th>
                  <th className="px-5 py-3 font-medium">Completed</th>
                  <th className="px-5 py-3 font-medium">Rejected</th>
                  <th className="px-5 py-3 font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-6 text-center text-sm text-slate-500">Loading…</td>
                  </tr>
                ) : (data?.byDivision ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-6 text-center text-sm text-slate-500">No enquiry data yet.</td>
                  </tr>
                ) : (
                  (data?.byDivision ?? []).map((d) => (
                    <tr key={d.divisionId} className="hover:bg-slate-50/60">
                      <td className="px-5 py-3 font-medium text-slate-900">
                        <span className="inline-flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-slate-400" /> {d.divisionName}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-slate-700">{d.placed}</td>
                      <td className="px-5 py-3 text-slate-700">{d.inProgress}</td>
                      <td className="px-5 py-3 text-slate-700">{d.completed}</td>
                      <td className="px-5 py-3 text-slate-700">{d.rejected}</td>
                      <td className="px-5 py-3 font-semibold text-slate-900">{d.total}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="border border-slate-200/70 shadow-none">
        <CardContent className="p-0">
          <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Recent enquiries</h2>
              <p className="text-xs text-slate-500">
                {filtered.length} enquiries match · showing {filtered.length === 0 ? 0 : startIdx + 1}
                –{Math.min(startIdx + PAGE_SIZE, filtered.length)} of {filtered.length}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search enquiry / customer…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-md border border-slate-200 bg-white py-1.5 pl-7 pr-2 text-sm text-slate-900 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 sm:w-64"
                />
              </label>
              <select
                value={divisionId}
                onChange={(e) => setDivisionId(e.target.value)}
                className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-slate-900"
              >
                <option value="">All divisions</option>
                {(data?.byDivision ?? []).map((d) => (
                  <option key={d.divisionId} value={d.divisionId}>
                    {d.divisionName}
                  </option>
                ))}
              </select>
              {search || divisionId ? (
                <Button type="button" variant="ghost" onClick={() => { setSearch(""); setDivisionId(""); }}>
                  Reset
                </Button>
              ) : null}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/60 text-left text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Enquiry</th>
                  <th className="px-5 py-3 font-medium">Customer</th>
                  <th className="px-5 py-3 font-medium">Division</th>
                  <th className="px-5 py-3 font-medium">Product</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Updated</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-6 text-center text-sm text-slate-500">Loading…</td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-6 text-center text-sm text-slate-500">No enquiries match.</td>
                  </tr>
                ) : (
                  pageRows.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/60">
                      <td className="px-5 py-3">
                        <Link href={`/orders/${r.id}`} className="font-mono text-xs font-semibold text-slate-900 hover:underline">
                          {r.orderNumber}
                        </Link>
                      </td>
                      <td className="px-5 py-3 font-medium text-slate-800">
                        <span className="inline-flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5 text-slate-400" /> {r.companyName ?? "—"}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-slate-700">{r.currentDivision.name}</td>
                      <td className="px-5 py-3 text-slate-700">
                        {r.productKind ? (
                          <span className={cn(
                            "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
                            r.productKind === "NEW" ? "bg-blue-50 text-blue-700 ring-1 ring-blue-100" : "bg-slate-100 text-slate-700"
                          )}>
                            {r.productKind === "NEW" ? "New product" : "Existing"}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-slate-700">{r.status}</td>
                      <td className="px-5 py-3 text-xs text-slate-500">{relativeTime(r.updatedAt)}</td>
                      <td className="px-5 py-3 text-right">
                        <Link href={`/orders/${r.id}`} className="inline-flex items-center text-xs font-medium text-slate-700 hover:text-slate-900">
                          Open <ChevronRight className="ml-0.5 h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pager */}
          {filtered.length > PAGE_SIZE ? (
            <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 text-xs text-slate-600">
              <span>
                Page {safePage} of {totalPages} · {PAGE_SIZE} per page
              </span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 px-2 text-xs"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                >
                  <ChevronLeft className="mr-1 h-3 w-3" /> Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 px-2 text-xs"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                >
                  Next <ChevronRight className="ml-1 h-3 w-3" />
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
