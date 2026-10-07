"use client";

import { Suspense, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Package,
  Plus,
  Search,
  X,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Panel, PageHeader, EmptyState } from "@/components/ui/panel";
import { StatusPill, PriorityPill } from "@/components/ui/status-pill";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { EnquiryPeriodFilter } from "@/lib/date-period";
import { PERIOD_LABELS } from "@/lib/date-period";
import { formatEnquiryNumberShort } from "@/lib/enquiry-display";
import { downloadEnquiriesExcel, fetchAllOrdersForExport } from "@/lib/enquiry-export";
import { userMayCreateEnquiry } from "@/lib/enquiry-access";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 15;

const STATUS_TABS = [
  { value: "", label: "All" },
  { value: "PLACED", label: "Awaiting acceptance" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "TRANSFERRED", label: "Transferred" },
  { value: "COMPLETED", label: "Completed" },
  { value: "REJECTED", label: "Rejected" },
  { value: "CANCELLED", label: "Cancelled" },
];

type OrderRow = {
  id: number;
  orderNumber: string;
  status: string;
  priority: string;
  companyName: string | null;
  customerName: string | null;
  slaDeadline: string | null;
  assignedSupervisorId: number | null;
  createdAt: string;
  currentDivision?: { name: string } | null;
  createdBy?: { name: string; email: string } | null;
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function OrdersPageInner() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useSearchParams();

  const initialQuery = params.get("q") ?? "";
  const initialStatus = params.get("status") ?? "";

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(initialQuery);
  const [appliedSearch, setAppliedSearch] = useState(initialQuery);
  const [status, setStatus] = useState(initialStatus);
  const [period, setPeriod] = useState<EnquiryPeriodFilter>("");
  const [divisionId, setDivisionId] = useState("");
  const [exporting, setExporting] = useState(false);

  // The header search box navigates here with ?q=…; pick that up on arrival.
  useEffect(() => {
    setSearch(initialQuery);
    setAppliedSearch(initialQuery);
    setPage(1);
  }, [initialQuery]);
  useEffect(() => {
    setStatus(initialStatus);
    setPage(1);
  }, [initialStatus]);

  const isAccountsView = user?.role === "ACCOUNTS";
  const canCreate = Boolean(user && userMayCreateEnquiry(user.role) && !isAccountsView);
  const hideDivision = user?.role === "MANAGER";

  const { data, isLoading } = useQuery({
    queryKey: ["orders", page, period, divisionId, status, appliedSearch],
    queryFn: async () => {
      const qs = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (period) qs.set("period", period);
      if (divisionId) qs.set("divisionId", divisionId);
      if (status) qs.set("status", status);
      if (appliedSearch) qs.set("q", appliedSearch);
      const res = await fetch(`/api/orders?${qs.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch enquiries");
      return res.json() as Promise<{ orders: OrderRow[]; total: number }>;
    },
    staleTime: 30_000,
    enabled: Boolean(user),
  });

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

  const orders = data?.orders ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const now = Date.now();

  async function handleExport() {
    setExporting(true);
    try {
      const rows = await fetchAllOrdersForExport({ period, divisionId });
      const label = PERIOD_LABELS.find((p) => p.value === period)?.label ?? "All time";
      downloadEnquiriesExcel(rows, label, hideDivision);
    } finally {
      setExporting(false);
    }
  }

  function applySearch(e: React.FormEvent) {
    e.preventDefault();
    setAppliedSearch(search.trim());
    setPage(1);
  }

  function clearSearch() {
    setSearch("");
    setAppliedSearch("");
    setPage(1);
    router.replace("/orders");
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Enquiries"
        description={
          isAccountsView
            ? "Every enquiry across all divisions, for commercial review."
            : "Everything you are allowed to see, newest first."
        }
      >
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--app-line)] bg-white px-3.5 text-sm font-semibold text-[var(--app-ink-2)] hover:bg-[var(--app-surface-sunk)] disabled:opacity-60"
        >
          <FileSpreadsheet className="h-4 w-4" aria-hidden />
          {exporting ? "Preparing…" : "Export"}
        </button>
        {canCreate ? (
          <Link
            href="/orders/new"
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--app-brand)] px-4 text-sm font-semibold text-white hover:bg-[var(--app-brand-strong)]"
          >
            <Plus className="h-4 w-4" aria-hidden />
            New enquiry
          </Link>
        ) : null}
      </PageHeader>

      {/* ── Filters ───────────────────────────────────────────────── */}
      <Panel className="p-4">
        <form onSubmit={applySearch} className="flex flex-wrap items-center gap-3" role="search">
          <div className="relative min-w-[220px] flex-1">
            <label htmlFor="orders-search" className="sr-only">
              Search enquiries
            </label>
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--app-ink-3)]"
              aria-hidden
            />
            <input
              id="orders-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Enquiry number, company, customer, phone or email"
              className="h-10 w-full rounded-xl border border-[var(--app-line)] bg-white pl-10 pr-4 text-sm text-[var(--app-ink)] placeholder:text-[var(--app-ink-3)] focus:border-[var(--app-brand-line)] focus:outline-none"
            />
          </div>

          <Select value={period || "all"} onValueChange={(v) => { setPeriod(v === "all" ? "" : (v as EnquiryPeriodFilter)); setPage(1); }}>
            <SelectTrigger className="h-10 w-[150px] rounded-xl border-[var(--app-line)]">
              <SelectValue placeholder="All time" />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_LABELS.map((p) => (
                <SelectItem key={p.value || "all"} value={p.value || "all"}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {isAccountsView && divisions.length > 0 ? (
            <Select value={divisionId || "all"} onValueChange={(v) => { setDivisionId(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="h-10 w-[180px] rounded-xl border-[var(--app-line)]">
                <SelectValue placeholder="All divisions" />
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
          ) : null}

          <button
            type="submit"
            className="inline-flex h-10 items-center rounded-xl bg-[var(--app-ink)] px-4 text-sm font-semibold text-white hover:bg-black"
          >
            Search
          </button>
          {appliedSearch ? (
            <button
              type="button"
              onClick={clearSearch}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[var(--app-line)] px-3 text-sm font-semibold text-[var(--app-ink-2)] hover:bg-[var(--app-surface-sunk)]"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
              Clear
            </button>
          ) : null}
        </form>

        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-[var(--app-line-soft)] pt-3">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value || "all"}
              type="button"
              aria-pressed={status === tab.value}
              onClick={() => {
                setStatus(tab.value);
                setPage(1);
              }}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-semibold",
                status === tab.value
                  ? "bg-[var(--app-brand)] text-white"
                  : "border border-[var(--app-line)] text-[var(--app-ink-2)] hover:bg-[var(--app-surface-sunk)]"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </Panel>

      {/* ── Results ──────────────────────────────────────────────── */}
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--app-line-soft)] px-5 py-3.5">
          <p className="text-sm font-semibold text-[var(--app-ink-2)]">
            {isLoading ? (
              "Loading…"
            ) : (
              <>
                <span className="tnum font-extrabold text-[var(--app-ink)]">{total}</span> enquir
                {total === 1 ? "y" : "ies"}
                {appliedSearch ? ` matching “${appliedSearch}”` : ""}
              </>
            )}
          </p>
          {pageCount > 1 ? (
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
                Page {page} of {pageCount}
              </span>
              <button
                type="button"
                aria-label="Next page"
                disabled={page >= pageCount}
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
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
              <div key={i} className="h-14 animate-pulse rounded-xl bg-[var(--app-surface-sunk)]" />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <EmptyState
            icon={Package}
            title={appliedSearch ? "Nothing matched that search" : "No enquiries here yet"}
            description={
              appliedSearch
                ? "Try the enquiry number without the Enq- prefix, or part of the company name."
                : canCreate
                  ? "Create one and it will show up here with its next step."
                  : "Enquiries appear here as soon as they reach you."
            }
            action={
              canCreate && !appliedSearch ? (
                <Link
                  href="/orders/new"
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--app-brand)] px-4 text-sm font-semibold text-white hover:bg-[var(--app-brand-strong)]"
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  New enquiry
                </Link>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-left">
              <thead>
                <tr className="border-b border-[var(--app-line-soft)] bg-[var(--app-surface-sunk)]">
                  <th scope="col" className="px-5 py-2.5 text-[11px] font-bold uppercase tracking-wide text-[var(--app-ink-3)]">
                    Enquiry
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-[var(--app-ink-3)]">
                    Status
                  </th>
                  {!hideDivision ? (
                    <th scope="col" className="px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-[var(--app-ink-3)]">
                      Division
                    </th>
                  ) : null}
                  <th scope="col" className="px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-[var(--app-ink-3)]">
                    Submitted by
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-[var(--app-ink-3)]">
                    Created
                  </th>
                  <th scope="col" className="px-5 py-2.5 text-right text-[11px] font-bold uppercase tracking-wide text-[var(--app-ink-3)]">
                    Deadline
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--app-line-soft)]">
                {orders.map((o) => {
                  const overdue = Boolean(
                    o.slaDeadline &&
                      new Date(o.slaDeadline).getTime() < now &&
                      ["PLACED", "IN_PROGRESS", "TRANSFERRED"].includes(o.status)
                  );
                  return (
                    <tr key={o.id} className="hover:bg-[var(--app-brand-tint)]/30">
                      <td className="px-5 py-3">
                        <Link href={`/orders/${o.id}`} className="block">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="tnum rounded-md bg-[var(--app-surface-sunk)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--app-ink-2)]">
                              {formatEnquiryNumberShort(o.orderNumber)}
                            </span>
                            <span className="text-sm font-bold text-[var(--app-ink)] hover:underline">
                              {o.companyName || o.customerName || "Untitled enquiry"}
                            </span>
                            <PriorityPill priority={o.priority === "NORMAL" ? null : o.priority} />
                          </span>
                          {o.companyName && o.customerName ? (
                            <span className="mt-0.5 block text-xs text-[var(--app-ink-3)]">
                              {o.customerName}
                            </span>
                          ) : null}
                        </Link>
                      </td>
                      <td className="px-3 py-3">
                        <StatusPill status={o.status} size="sm" />
                      </td>
                      {!hideDivision ? (
                        <td className="px-3 py-3 text-sm text-[var(--app-ink-2)]">
                          {o.currentDivision?.name ?? "—"}
                        </td>
                      ) : null}
                      <td className="px-3 py-3 text-sm text-[var(--app-ink-2)]">
                        {o.createdBy?.name ?? "—"}
                      </td>
                      <td className="tnum px-3 py-3 text-sm text-[var(--app-ink-2)]">
                        {formatDate(o.createdAt)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {o.slaDeadline ? (
                          <span
                            className={cn(
                              "tnum inline-flex rounded-md px-2 py-1 text-xs font-bold",
                              overdue
                                ? "bg-[var(--app-late-bg)] text-[var(--app-late-ink)]"
                                : "text-[var(--app-ink-2)]"
                            )}
                          >
                            {overdue ? "Overdue · " : ""}
                            {formatDate(o.slaDeadline)}
                          </span>
                        ) : (
                          <span className="text-xs text-[var(--app-ink-3)]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-[var(--app-surface-sunk)]" />}>
      <OrdersPageInner />
    </Suspense>
  );
}
