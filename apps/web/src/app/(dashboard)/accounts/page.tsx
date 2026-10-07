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
import { Building2, CheckCircle2, ChevronLeft, ChevronRight, Package, Search, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/panel";
import { StatTile } from "@/components/ui/stat-tile";
import { Callout } from "@/components/ui/guidance";
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
      <PageHeader
        title="Commercial & customer overview"
        description="Every division's enquiries in one place, with customer rollups and the current pipeline."
      />

      {error ? (
        <Callout
          tone="late"
          title="Could not load the accounts overview"
          action={
            <Button type="button" variant="outline" onClick={() => refetch()}>
              Try again
            </Button>
          }
        >
          <p>{(error as Error).message}</p>
          <p className="mt-1 text-xs">
            If this is the first run after a schema change, run{" "}
            <code className="rounded bg-white px-1 py-0.5 font-mono text-[10px]">
              npx prisma migrate deploy
            </code>{" "}
            in apps/web and restart the server.
          </p>
        </Callout>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Total enquiries"
          value={totals}
          caption="Across every division"
          icon={Package}
          tone="brand"
          loading={isLoading}
        />
        <StatTile
          label="Still open"
          value={data?.openCount ?? 0}
          caption="Placed, in progress or transferring"
          icon={Building2}
          tone="wait"
          loading={isLoading}
        />
        <StatTile
          label="Completed"
          value={data?.statusCounts?.COMPLETED ?? 0}
          caption="Ready for commercial review"
          icon={CheckCircle2}
          tone="done"
          loading={isLoading}
        />
        <StatTile
          label="Customers"
          value={data?.totalCustomers ?? 0}
          caption="Distinct companies on record"
          icon={Users}
          tone="neutral"
          loading={isLoading}
        />
      </div>

      <Card className="border border-[var(--app-line)] shadow-none">
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b border-[var(--app-line-soft)] px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-[var(--app-ink)]">Division performance</h2>
              <p className="text-xs text-[var(--app-ink-3)]">Status mix per division.</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--app-surface-sunk)]/60 text-left text-xs uppercase tracking-wider text-[var(--app-ink-3)]">
                <tr>
                  <th className="px-5 py-3 font-medium">Division</th>
                  <th className="px-5 py-3 font-medium">Placed</th>
                  <th className="px-5 py-3 font-medium">In progress</th>
                  <th className="px-5 py-3 font-medium">Completed</th>
                  <th className="px-5 py-3 font-medium">Rejected</th>
                  <th className="px-5 py-3 font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--app-line-soft)]">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-6 text-center text-sm text-[var(--app-ink-3)]">Loading…</td>
                  </tr>
                ) : (data?.byDivision ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-6 text-center text-sm text-[var(--app-ink-3)]">No enquiry data yet.</td>
                  </tr>
                ) : (
                  (data?.byDivision ?? []).map((d) => (
                    <tr key={d.divisionId} className="hover:bg-[var(--app-surface-sunk)]/60">
                      <td className="px-5 py-3 font-medium text-[var(--app-ink)]">
                        <span className="inline-flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-[var(--app-ink-3)]" /> {d.divisionName}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-[var(--app-ink-2)]">{d.placed}</td>
                      <td className="px-5 py-3 text-[var(--app-ink-2)]">{d.inProgress}</td>
                      <td className="px-5 py-3 text-[var(--app-ink-2)]">{d.completed}</td>
                      <td className="px-5 py-3 text-[var(--app-ink-2)]">{d.rejected}</td>
                      <td className="px-5 py-3 font-semibold text-[var(--app-ink)]">{d.total}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="border border-[var(--app-line)] shadow-none">
        <CardContent className="p-0">
          <div className="flex flex-col gap-3 border-b border-[var(--app-line-soft)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-[var(--app-ink)]">Recent enquiries</h2>
              <p className="text-xs text-[var(--app-ink-3)]">
                {filtered.length} enquiries match · showing {filtered.length === 0 ? 0 : startIdx + 1}
                –{Math.min(startIdx + PAGE_SIZE, filtered.length)} of {filtered.length}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--app-ink-3)]" />
                <input
                  type="text"
                  placeholder="Search enquiry / customer…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-md border border-[var(--app-line)] bg-white py-1.5 pl-7 pr-2 text-sm text-[var(--app-ink)] outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 sm:w-64"
                />
              </label>
              <select
                value={divisionId}
                onChange={(e) => setDivisionId(e.target.value)}
                className="rounded-md border border-[var(--app-line)] bg-white px-2 py-1.5 text-sm text-[var(--app-ink)] outline-none focus:border-slate-900"
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
              <thead className="bg-[var(--app-surface-sunk)]/60 text-left text-xs uppercase tracking-wider text-[var(--app-ink-3)]">
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
              <tbody className="divide-y divide-[var(--app-line-soft)]">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-6 text-center text-sm text-[var(--app-ink-3)]">Loading…</td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-6 text-center text-sm text-[var(--app-ink-3)]">No enquiries match.</td>
                  </tr>
                ) : (
                  pageRows.map((r) => (
                    <tr key={r.id} className="hover:bg-[var(--app-surface-sunk)]/60">
                      <td className="px-5 py-3">
                        <Link href={`/orders/${r.id}`} className="font-mono text-xs font-semibold text-[var(--app-ink)] hover:underline">
                          {r.orderNumber}
                        </Link>
                      </td>
                      <td className="px-5 py-3 font-medium text-[var(--app-ink)]">
                        <span className="inline-flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5 text-[var(--app-ink-3)]" /> {r.companyName ?? "—"}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-[var(--app-ink-2)]">{r.currentDivision.name}</td>
                      <td className="px-5 py-3 text-[var(--app-ink-2)]">
                        {r.productKind ? (
                          <span className={cn(
                            "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
                            r.productKind === "NEW" ? "bg-blue-50 text-blue-700 ring-1 ring-blue-100" : "bg-[var(--app-line-soft)] text-[var(--app-ink-2)]"
                          )}>
                            {r.productKind === "NEW" ? "New product" : "Existing"}
                          </span>
                        ) : (
                          <span className="text-xs text-[var(--app-ink-3)]">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-[var(--app-ink-2)]">{r.status}</td>
                      <td className="px-5 py-3 text-xs text-[var(--app-ink-3)]">{relativeTime(r.updatedAt)}</td>
                      <td className="px-5 py-3 text-right">
                        <Link href={`/orders/${r.id}`} className="inline-flex items-center text-xs font-medium text-[var(--app-ink-2)] hover:text-[var(--app-ink)]">
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
            <div className="flex items-center justify-between gap-3 border-t border-[var(--app-line-soft)] px-5 py-3 text-xs text-[var(--app-ink-2)]">
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
