"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
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
import { useAuth } from "@/hooks/use-auth";
import {
  AlertTriangle,
  ArrowRightLeft,
  Building2,
  ClipboardList,
  Radio,
  Timer,
} from "lucide-react";
import { cn } from "@/lib/utils";

type DivisionHead = { name: string; email: string };

type PipelineRow = {
  id: number;
  orderNumber: string;
  status: string;
  companyName: string | null;
  descriptionPreview: string | null;
  createdAt: string;
  updatedAt: string;
  slaDeadline: string | null;
  transferCount: number;
  currentDivision: { id: number; name: string };
  divisionHeads: DivisionHead[];
  createdBy: { id: number; name: string; email: string };
  acceptedBy: { id: number; name: string; email: string } | null;
  receivedBy: { id: number; name: string; email: string } | null;
  completedBy: { id: number; name: string; email: string } | null;
  responseSummary: string;
  escalated: boolean;
  breachAt: string | null;
  pastDueSla: boolean;
  hoursPastSla: number | null;
  recentTransfers: Array<{
    id: number;
    at: string;
    from: string;
    to: string;
    by: string;
    reasonPreview: string;
  }>;
};

type TransferRow = {
  id: number;
  createdAt: string;
  reason: string;
  order: { id: number; orderNumber: string; status: string };
  fromDivision: { id: number; name: string };
  toDivision: { id: number; name: string };
  transferredBy: { id: number; name: string; email: string };
};

type Overview = {
  statusCounts: Record<string, number>;
  openBreaches: number;
  delayedEnquiries: Array<{
    id: number;
    orderNumber: string;
    status: string;
    slaDeadline: string | null;
    companyName: string | null;
    currentDivision: { id: number; name: string };
  }>;
  recentBreaches: Array<{
    id: number;
    breachedAt: string;
    order: { id: number; orderNumber: string; status: string };
    division: { id: number; name: string };
    headRejectedAt: string | null;
    headRejectedBy: { id: number; name: string; email: string } | null;
    headRejectionMessage: string | null;
  }>;
  pipeline: PipelineRow[];
  transfers: TransferRow[];
};

const MD_PIPELINE_PAGE_SIZE = 5;
const MD_TRANSFERS_PAGE_SIZE = 5;
const MD_SLA_LIST_PAGE_SIZE = 5;

const PIPELINE_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "All active" },
  { value: "PLACED", label: "Placed" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "TRANSFERRED", label: "Transferred" },
  { value: "COMPLETED", label: "Completed" },
  { value: "REJECTED", label: "Rejected" },
  { value: "CANCELLED", label: "Cancelled" },
];

const AUDIT_PAGE_SIZE = 15;

const AUDIT_ACTION_TABS = [
  { value: "", label: "All" },
  { value: "OrderCreated", label: "Created" },
  { value: "OrderAccepted", label: "Accepted" },
  { value: "OrderTransferred", label: "Transferred" },
  { value: "OrderReceived", label: "Received" },
  { value: "OrderCompleted", label: "Completed" },
  { value: "OrderRejected", label: "Rejected" },
  { value: "SLABreachDetected", label: "SLA breach" },
  { value: "SLABreachHeadRejectionSubmitted", label: "SLA head rejection" },
  { value: "SampleDetailsUpdated", label: "Sample update" },
  { value: "SampleApproved", label: "Sample approved" },
  { value: "SampleShipped", label: "Sample shipped" },
  { value: "SalesFeedbackRecorded", label: "Sales feedback" },
] as const;

type MdAuditFeedResponse = {
  logs: Array<{
    id: number;
    createdAt: string;
    action: string;
    orderId: number;
    orderNumber: string;
    user: { name: string; email: string } | null;
    payloadPreview: string;
  }>;
  total: number;
  page: number;
  limit: number;
};

type PipelineFilters = {
  dateFrom: string;
  dateTo: string;
  status: string;
  divisionId: string;
};

function buildOverviewQuery(f: PipelineFilters): string {
  const q = new URLSearchParams();
  if (f.dateFrom.trim() && f.dateTo.trim()) {
    q.set("from", f.dateFrom.trim());
    q.set("to", f.dateTo.trim());
  }
  if (f.status.trim()) q.set("status", f.status.trim());
  if (f.divisionId.trim()) q.set("divisionId", f.divisionId.trim());
  const s = q.toString();
  return s ? `?${s}` : "";
}

async function fetchOverview(f: PipelineFilters): Promise<Overview> {
  const res = await fetch(`/api/md/overview${buildOverviewQuery(f)}`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load overview");
  return res.json();
}

async function fetchDivisionsForFilter(): Promise<{ id: number; name: string }[]> {
  const res = await fetch("/api/divisions", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load divisions");
  const data = await res.json();
  const list = data.divisions as { id: number; name: string }[];
  return list ?? [];
}

async function fetchMdAuditFeed(page: number, action: string): Promise<MdAuditFeedResponse> {
  const q = new URLSearchParams();
  q.set("page", String(page));
  q.set("limit", String(AUDIT_PAGE_SIZE));
  if (action) q.set("action", action);
  const res = await fetch(`/api/audit?${q}`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load activity log");
  return res.json();
}

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "success" | "warning"> = {
  PLACED: "secondary",
  IN_PROGRESS: "default",
  TRANSFERRED: "warning",
  REJECTED: "destructive",
  COMPLETED: "success",
  CANCELLED: "secondary",
};

const sections = [
  { id: "summary", label: "Summary" },
  { id: "pipeline", label: "Enquiry pipeline" },
  { id: "sla", label: "SLA & escalations" },
  { id: "transfers", label: "Transfers" },
  { id: "audit", label: "Activity log" },
] as const;

export default function MdOverviewPage() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const [auditPage, setAuditPage] = useState(1);
  const [auditAction, setAuditAction] = useState("");
  const [pipelinePage, setPipelinePage] = useState(1);
  const [transfersPage, setTransfersPage] = useState(1);
  const [delayedPage, setDelayedPage] = useState(1);
  const [breachesPage, setBreachesPage] = useState(1);
  const [pipelineDateFrom, setPipelineDateFrom] = useState("");
  const [pipelineDateTo, setPipelineDateTo] = useState("");
  const [pipelineStatus, setPipelineStatus] = useState("");
  const [pipelineDivisionId, setPipelineDivisionId] = useState("");

  const pipelineFilters: PipelineFilters = useMemo(
    () => ({
      dateFrom: pipelineDateFrom,
      dateTo: pipelineDateTo,
      status: pipelineStatus,
      divisionId: pipelineDivisionId,
    }),
    [pipelineDateFrom, pipelineDateTo, pipelineStatus, pipelineDivisionId]
  );

  const { data, isLoading, error } = useQuery({
    queryKey: ["md-overview", pipelineFilters],
    queryFn: () => fetchOverview(pipelineFilters),
  });

  const { data: divisionOptions = [] } = useQuery({
    queryKey: ["divisions-md-filter"],
    queryFn: fetchDivisionsForFilter,
    enabled: !!user,
    staleTime: 60_000,
  });
  const {
    data: auditFeed,
    isLoading: auditLoading,
    error: auditError,
  } = useQuery({
    queryKey: ["md-audit-feed", auditPage, auditAction],
    queryFn: () => fetchMdAuditFeed(auditPage, auditAction),
    enabled: !isLoading && !error && !!data,
  });

  const pipelineTotalPages = data
    ? Math.max(1, Math.ceil(data.pipeline.length / MD_PIPELINE_PAGE_SIZE))
    : 1;
  const transfersTotalPages = data
    ? Math.max(1, Math.ceil(data.transfers.length / MD_TRANSFERS_PAGE_SIZE))
    : 1;
  const delayedTotalPages = data
    ? Math.max(1, Math.ceil(data.delayedEnquiries.length / MD_SLA_LIST_PAGE_SIZE))
    : 1;
  const breachesTotalPages = data
    ? Math.max(1, Math.ceil(data.recentBreaches.length / MD_SLA_LIST_PAGE_SIZE))
    : 1;

  const pipelineSlice = useMemo(() => {
    if (!data) return [];
    const start = (pipelinePage - 1) * MD_PIPELINE_PAGE_SIZE;
    return data.pipeline.slice(start, start + MD_PIPELINE_PAGE_SIZE);
  }, [data, pipelinePage]);

  const transfersSlice = useMemo(() => {
    if (!data) return [];
    const start = (transfersPage - 1) * MD_TRANSFERS_PAGE_SIZE;
    return data.transfers.slice(start, start + MD_TRANSFERS_PAGE_SIZE);
  }, [data, transfersPage]);

  const delayedSlice = useMemo(() => {
    if (!data) return [];
    const start = (delayedPage - 1) * MD_SLA_LIST_PAGE_SIZE;
    return data.delayedEnquiries.slice(start, start + MD_SLA_LIST_PAGE_SIZE);
  }, [data, delayedPage]);

  const breachesSlice = useMemo(() => {
    if (!data) return [];
    const start = (breachesPage - 1) * MD_SLA_LIST_PAGE_SIZE;
    return data.recentBreaches.slice(start, start + MD_SLA_LIST_PAGE_SIZE);
  }, [data, breachesPage]);

  useEffect(() => {
    if (!data) return;
    setPipelinePage((p) => Math.min(p, pipelineTotalPages));
  }, [data, pipelineTotalPages]);

  useEffect(() => {
    setPipelinePage(1);
    setDelayedPage(1);
    setBreachesPage(1);
  }, [pipelineDateFrom, pipelineDateTo, pipelineStatus, pipelineDivisionId]);

  useEffect(() => {
    if (!data) return;
    setTransfersPage((p) => Math.min(p, transfersTotalPages));
  }, [data, transfersTotalPages]);

  useEffect(() => {
    if (!data) return;
    setDelayedPage((p) => Math.min(p, delayedTotalPages));
  }, [data, delayedTotalPages]);

  useEffect(() => {
    if (!data) return;
    setBreachesPage((p) => Math.min(p, breachesTotalPages));
  }, [data, breachesTotalPages]);

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-slate-500">
        Loading executive overview…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="rounded-lg border border-red-100 bg-red-50 text-red-800 px-4 py-3 text-sm">
        Could not load overview. You may not have access (Managing Director or Super Admin only).
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-16">
      <div className="sticky top-0 z-10 -mx-2 border-b border-slate-200/80 bg-white/95 px-2 py-3 backdrop-blur supports-backdrop-filter:bg-white/80">
        <div className="flex flex-wrap items-center gap-2">
          {sections.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              {s.label}
            </a>
          ))}
          {isSuperAdmin && (
            <Button variant="outline" size="sm" className="ml-auto h-8" asChild>
              <Link href="/sla">SLA & breaches (detail)</Link>
            </Button>
          )}
        </div>
      </div>

      <header id="summary" className="scroll-mt-24 space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Executive overview</h1>
        <p className="max-w-3xl text-slate-600">
          Organisation-wide visibility: who owns each enquiry, whether Division Heads have acted, SLA exposure,
          escalations, transfer reasons, and a live audit trail. 48-hour SLA applies while an enquiry is{" "}
          <strong>Placed</strong> or <strong>Transferred</strong> until accepted or received.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-amber-200/80 bg-linear-to-br from-amber-50/80 to-white shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-amber-900">
              <AlertTriangle className="h-4 w-4" />
              Open SLA breaches
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold text-slate-900">{data.openBreaches}</p>
            <p className="mt-1 text-xs text-amber-800/80">Escalated — deadline passed without timely action</p>
          </CardContent>
        </Card>
        <Card className="border-red-200/60 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-slate-600">
              <Timer className="h-4 w-4 text-red-600" />
              Past SLA deadline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold text-slate-900">{data.delayedEnquiries.length}</p>
            <p className="mt-1 text-xs text-slate-500">Awaiting head action (shown up to 50)</p>
          </CardContent>
        </Card>
        {["PLACED", "IN_PROGRESS", "TRANSFERRED", "REJECTED", "CANCELLED", "COMPLETED"].map((s) => (
          <Card key={s} className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">{s.replace("_", " ")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold text-slate-900">{data.statusCounts[s] ?? 0}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <section id="pipeline" className="scroll-mt-24 space-y-4">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-slate-600" />
          <h2 className="text-xl font-semibold text-slate-900">Enquiry pipeline</h2>
        </div>
        <p className="text-sm text-slate-500">
          Up to 100 enquiries per result set, shown {MD_PIPELINE_PAGE_SIZE} per page. Filter by created date,
          status, or division. Default list excludes rejected and cancelled unless you choose those statuses.
        </p>
        <Card className="border-slate-200/90 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Pipeline filters</CardTitle>
            <p className="text-sm font-normal text-slate-500">
              Date range filters by <strong className="font-medium text-slate-600">created date</strong> (UTC day
              bounds). Both from and to are required for the range to apply.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wide text-slate-500">From</Label>
                  <input
                    type="date"
                    value={pipelineDateFrom}
                    onChange={(e) => setPipelineDateFrom(e.target.value)}
                    className="flex h-9 w-full min-w-40 rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-sm sm:w-40"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wide text-slate-500">To</Label>
                  <input
                    type="date"
                    value={pipelineDateTo}
                    onChange={(e) => setPipelineDateTo(e.target.value)}
                    className="flex h-9 w-full min-w-40 rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-sm sm:w-40"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wide text-slate-500">Status</Label>
                <Select
                  value={pipelineStatus || "all"}
                  onValueChange={(v) => setPipelineStatus(v === "all" ? "" : v)}
                >
                  <SelectTrigger className="w-full min-w-0 sm:w-[200px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    {PIPELINE_STATUS_OPTIONS.map((o) => (
                      <SelectItem key={o.value || "all"} value={o.value || "all"}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wide text-slate-500">Division</Label>
                <Select
                  value={pipelineDivisionId || "all"}
                  onValueChange={(v) => setPipelineDivisionId(v === "all" ? "" : v)}
                >
                  <SelectTrigger className="w-full min-w-0 sm:w-[220px]">
                    <SelectValue placeholder="All divisions" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All divisions</SelectItem>
                    {divisionOptions.map((d) => (
                      <SelectItem key={d.id} value={String(d.id)}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {(pipelineDateFrom || pipelineDateTo || pipelineStatus || pipelineDivisionId) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-slate-600"
                  onClick={() => {
                    setPipelineDateFrom("");
                    setPipelineDateTo("");
                    setPipelineStatus("");
                    setPipelineDivisionId("");
                  }}
                >
                  Clear filters
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Enquiry</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Division</th>
                  <th className="px-4 py-3">Responsible heads</th>
                  <th className="px-4 py-3">Response / ownership</th>
                  <th className="px-4 py-3">SLA</th>
                  <th className="px-4 py-3">Transfers</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pipelineSlice.map((row) => (
                <tr key={row.id} className="align-top hover:bg-slate-50/80">
                  <td className="px-4 py-3">
                    <Link href={`/orders/${row.id}`} className="font-semibold text-indigo-700 hover:underline">
                      {row.orderNumber}
                    </Link>
                    <p className="text-xs text-slate-500">{row.companyName ?? "—"}</p>
                    {row.descriptionPreview && (
                      <p className="mt-1 line-clamp-2 text-xs text-slate-400">{row.descriptionPreview}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={statusVariant[row.status] ?? "secondary"}>{row.status.replace("_", " ")}</Badge>
                    {row.escalated && (
                      <Badge variant="destructive" className="ml-1">
                        Escalated
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 text-slate-700">
                      <Building2 className="h-3.5 w-3.5 text-slate-400" />
                      {row.currentDivision.name}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {row.divisionHeads.length ? (
                      <ul className="space-y-0.5">
                        {row.divisionHeads.map((h) => (
                          <li key={h.email}>
                            <span className="font-medium text-slate-800">{h.name}</span>
                            <span className="block text-slate-400">{h.email}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-amber-700">No Division Head assigned</span>
                    )}
                  </td>
                  <td className="max-w-[240px] px-4 py-3 text-xs text-slate-700">
                    <p>{row.responseSummary}</p>
                    <p className="mt-1 text-slate-400">Created by {row.createdBy.name}</p>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {row.slaDeadline ? (
                      <span className={cn(row.pastDueSla && "font-medium text-red-700")}>
                        {new Date(row.slaDeadline).toLocaleString()}
                        {row.hoursPastSla != null && row.pastDueSla && (
                          <span className="block text-red-600">{row.hoursPastSla}h overdue</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="max-w-[220px] px-4 py-3 text-xs text-slate-600">
                    {row.transferCount === 0 ? (
                      <span className="text-slate-400">None</span>
                    ) : (
                      <ul className="space-y-2">
                        {row.recentTransfers.map((t) => (
                          <li key={t.id} className="rounded border border-slate-100 bg-slate-50/80 p-2">
                            <span className="font-medium text-slate-700">
                              {t.from} → {t.to}
                            </span>
                            <span className="block text-slate-500">by {t.by}</span>
                            <span className="mt-0.5 line-clamp-3 block text-slate-400">{t.reasonPreview}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500">
              Page {pipelinePage} of {pipelineTotalPages} · {data.pipeline.length}{" "}
              {data.pipeline.length === 1 ? "enquiry" : "enquiries"}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8"
                disabled={pipelinePage <= 1}
                onClick={() => setPipelinePage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8"
                disabled={pipelinePage >= pipelineTotalPages}
                onClick={() => setPipelinePage((p) => Math.min(pipelineTotalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section id="sla" className="scroll-mt-24 grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Timer className="h-5 w-5 text-red-600" />
            <h2 className="text-xl font-semibold text-slate-900">Past deadline (action needed)</h2>
          </div>
          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-0">
              {!data.delayedEnquiries.length ? (
                <p className="px-6 pt-6 pb-6 text-sm text-slate-500">No enquiries currently past the SLA deadline.</p>
              ) : (
                <>
                  <ul className="divide-y divide-slate-100 px-6 pt-6">
                    {delayedSlice.map((o) => (
                      <li key={o.id} className="flex flex-wrap items-start justify-between gap-2 py-3 first:pt-0">
                        <div>
                          <Link href={`/orders/${o.id}`} className="font-semibold text-indigo-700 hover:underline">
                            {o.orderNumber}
                          </Link>
                          <p className="text-xs text-slate-500">{o.companyName ?? "—"} · {o.currentDivision.name}</p>
                        </div>
                        <div className="text-right">
                          <Badge variant="secondary">{o.status}</Badge>
                          {o.slaDeadline && (
                            <p className="mt-1 text-xs text-red-600">
                              Due {new Date(o.slaDeadline).toLocaleString()}
                            </p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-slate-500">
                      Page {delayedPage} of {delayedTotalPages} · {data.delayedEnquiries.length}{" "}
                      {data.delayedEnquiries.length === 1 ? "enquiry" : "enquiries"}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8"
                        disabled={delayedPage <= 1}
                        onClick={() => setDelayedPage((p) => Math.max(1, p - 1))}
                      >
                        Previous
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8"
                        disabled={delayedPage >= delayedTotalPages}
                        onClick={() => setDelayedPage((p) => Math.min(delayedTotalPages, p + 1))}
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
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <h2 className="text-xl font-semibold text-slate-900">Recorded escalations (open breaches)</h2>
          </div>
          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-0">
              {!data.recentBreaches.length ? (
                <p className="px-6 pt-6 pb-6 text-sm text-slate-500">No open breach records.</p>
              ) : (
                <>
                  <ul className="divide-y divide-slate-100 px-6 pt-6">
                    {breachesSlice.map((b) => (
                      <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0">
                        <div>
                          <Link
                            href={`/orders/${b.order.id}`}
                            className="font-semibold text-indigo-700 hover:underline"
                          >
                            {b.order.orderNumber}
                          </Link>
                          <p className="text-xs text-slate-500">{b.division.name}</p>
                          {b.headRejectedAt ? (
                            <p className="mt-1 text-xs text-emerald-700">
                              Head rejection: {new Date(b.headRejectedAt).toLocaleString()}
                              {b.headRejectedBy?.name ? <> · {b.headRejectedBy.name}</> : null}
                            </p>
                          ) : (
                            <p className="mt-1 text-xs font-medium text-amber-700">Awaiting head rejection message</p>
                          )}
                        </div>
                        <span className="text-xs text-slate-500">{new Date(b.breachedAt).toLocaleString()}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-slate-500">
                      Page {breachesPage} of {breachesTotalPages} · {data.recentBreaches.length} breach
                      {data.recentBreaches.length === 1 ? "" : "es"}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8"
                        disabled={breachesPage <= 1}
                        onClick={() => setBreachesPage((p) => Math.max(1, p - 1))}
                      >
                        Previous
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8"
                        disabled={breachesPage >= breachesTotalPages}
                        onClick={() => setBreachesPage((p) => Math.min(breachesTotalPages, p + 1))}
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
      </section>

      <section id="transfers" className="scroll-mt-24 space-y-4">
        <div className="flex items-center gap-2">
          <ArrowRightLeft className="h-5 w-5 text-slate-600" />
          <h2 className="text-xl font-semibold text-slate-900">Transfer ledger</h2>
        </div>
        <p className="text-sm text-slate-500">
          Every cross-division move with full reason and who initiated it ({MD_TRANSFERS_PAGE_SIZE} per page).
        </p>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">Enquiry</th>
                  <th className="px-4 py-3">Route</th>
                  <th className="px-4 py-3">By</th>
                  <th className="px-4 py-3">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transfersSlice.map((t) => (
                <tr key={t.id} className="align-top hover:bg-slate-50/80">
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                    {new Date(t.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/orders/${t.order.id}`} className="font-medium text-indigo-700 hover:underline">
                      {t.order.orderNumber}
                    </Link>
                    <Badge variant="outline" className="ml-2 text-[10px]">
                      {t.order.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {t.fromDivision.name} → {t.toDivision.name}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <span className="font-medium text-slate-800">{t.transferredBy.name}</span>
                    <span className="block text-slate-400">{t.transferredBy.email}</span>
                  </td>
                  <td className="max-w-md px-4 py-3 text-xs text-slate-600 whitespace-pre-wrap">{t.reason}</td>
                </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500">
              Page {transfersPage} of {transfersTotalPages} · {data.transfers.length} transfer
              {data.transfers.length === 1 ? "" : "s"}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8"
                disabled={transfersPage <= 1}
                onClick={() => setTransfersPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8"
                disabled={transfersPage >= transfersTotalPages}
                onClick={() => setTransfersPage((p) => Math.min(transfersTotalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section id="audit" className="scroll-mt-24 space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Radio className="h-5 w-5 shrink-0 text-slate-600" />
              <h2 className="text-xl font-semibold text-slate-900">Live activity log</h2>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Paginated audit trail across all enquiries. Filter by event type; click an order number for read-only
              details.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-start gap-1.5 lg:max-w-[min(100%,42rem)] lg:justify-end">
            {AUDIT_ACTION_TABS.map((tab) => (
              <Button
                key={tab.value || "all"}
                type="button"
                variant={auditAction === tab.value ? "default" : "outline"}
                size="sm"
                className={cn(
                  "h-8 rounded-full px-3 text-xs",
                  auditAction === tab.value ? "shadow-sm" : "border-slate-200 bg-white text-slate-700"
                )}
                onClick={() => {
                  setAuditAction(tab.value);
                  setAuditPage(1);
                }}
              >
                {tab.label}
              </Button>
            ))}
          </div>
        </div>
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="p-0">
            {auditLoading && (
              <div className="px-4 py-10 text-center text-sm text-slate-500">Loading activity…</div>
            )}
            {auditError && (
              <div className="px-4 py-6 text-center text-sm text-red-600">Could not load activity log.</div>
            )}
            {!auditLoading && !auditError && auditFeed && auditFeed.logs.length === 0 && (
              <div className="px-4 py-10 text-center text-sm text-slate-500">No events match this filter.</div>
            )}
            {!auditLoading && !auditError && auditFeed && auditFeed.logs.length > 0 && (
              <ul className="divide-y divide-slate-100">
                {auditFeed.logs.map((a) => (
                  <li
                    key={a.id}
                    className="flex flex-col gap-1 px-4 py-3 hover:bg-slate-50/60 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-slate-400">
                          {new Date(a.createdAt).toLocaleString()}
                        </span>
                        <Badge variant="secondary" className="text-[10px]">
                          {a.action}
                        </Badge>
                        <Link
                          href={`/orders/${a.orderId}?from=audit`}
                          className="text-sm font-semibold text-indigo-700 hover:underline"
                        >
                          {a.orderNumber}
                        </Link>
                      </div>
                      {a.user && (
                        <p className="mt-1 text-xs text-slate-500">
                          {a.user.name} · {a.user.email}
                        </p>
                      )}
                      {!a.user && <p className="mt-1 text-xs text-slate-400">System / integration</p>}
                      {a.payloadPreview && (
                        <pre className="mt-2 max-h-24 overflow-auto rounded-md bg-slate-900/5 p-2 text-[11px] text-slate-600">
                          {a.payloadPreview}
                        </pre>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {!auditLoading && !auditError && auditFeed && auditFeed.total > 0 && (
              <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-slate-500">
                  Page {auditFeed.page} of {Math.max(1, Math.ceil(auditFeed.total / auditFeed.limit))} ·{" "}
                  {auditFeed.total} event{auditFeed.total === 1 ? "" : "s"}
                  {auditAction ? (
                    <>
                      {" "}
                      · filter: <span className="font-medium text-slate-700">{auditAction || "All"}</span>
                    </>
                  ) : null}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8"
                    disabled={auditPage <= 1}
                    onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8"
                    disabled={auditPage >= Math.ceil(auditFeed.total / auditFeed.limit)}
                    onClick={() => setAuditPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
