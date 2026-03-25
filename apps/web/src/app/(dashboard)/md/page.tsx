"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

type AuditRow = {
  id: number;
  createdAt: string;
  action: string;
  orderId: number;
  orderNumber: string;
  user: { name: string; email: string } | null;
  payloadPreview: string;
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
  }>;
  pipeline: PipelineRow[];
  transfers: TransferRow[];
  auditFeed: AuditRow[];
};

async function fetchOverview(): Promise<Overview> {
  const res = await fetch("/api/md/overview", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load overview");
  return res.json();
}

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "success" | "warning"> = {
  PLACED: "secondary",
  IN_PROGRESS: "default",
  TRANSFERRED: "warning",
  REJECTED: "destructive",
  COMPLETED: "success",
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
  const { data, isLoading, error } = useQuery({
    queryKey: ["md-overview"],
    queryFn: fetchOverview,
  });

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
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Executive overview</h1>
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
        {["PLACED", "IN_PROGRESS", "TRANSFERRED", "COMPLETED"].map((s) => (
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
          Latest 100 active enquiries (excluding rejected). Division Heads responsible, response state, SLA risk,
          and recent transfer snippets.
        </p>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
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
              {data.pipeline.map((row) => (
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
      </section>

      <section id="sla" className="scroll-mt-24 grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Timer className="h-5 w-5 text-red-600" />
            <h2 className="text-xl font-semibold text-slate-900">Past deadline (action needed)</h2>
          </div>
          <Card className="border-slate-200 shadow-sm">
            <CardContent className="pt-6">
              {!data.delayedEnquiries.length ? (
                <p className="text-sm text-slate-500">No enquiries currently past the SLA deadline.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {data.delayedEnquiries.map((o) => (
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
            <CardContent className="pt-6">
              {!data.recentBreaches.length ? (
                <p className="text-sm text-slate-500">No open breach records.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {data.recentBreaches.map((b) => (
                    <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0">
                      <div>
                        <Link
                          href={`/orders/${b.order.id}`}
                          className="font-semibold text-indigo-700 hover:underline"
                        >
                          {b.order.orderNumber}
                        </Link>
                        <p className="text-xs text-slate-500">{b.division.name}</p>
                      </div>
                      <span className="text-xs text-slate-500">{new Date(b.breachedAt).toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
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
        <p className="text-sm text-slate-500">Every cross-division move with full reason and who initiated it.</p>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
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
              {data.transfers.map((t) => (
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
      </section>

      <section id="audit" className="scroll-mt-24 space-y-4">
        <div className="flex items-center gap-2">
          <Radio className="h-5 w-5 text-slate-600" />
          <h2 className="text-xl font-semibold text-slate-900">Live activity log</h2>
        </div>
        <p className="text-sm text-slate-500">Latest 100 system events across all enquiries (audit trail).</p>
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="p-0">
            <ul className="divide-y divide-slate-100">
              {data.auditFeed.map((a) => (
                <li key={a.id} className="flex flex-col gap-1 px-4 py-3 hover:bg-slate-50/60 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-slate-400">{new Date(a.createdAt).toLocaleString()}</span>
                      <Badge variant="secondary" className="text-[10px]">
                        {a.action}
                      </Badge>
                      <Link href={`/orders/${a.orderId}`} className="text-sm font-semibold text-indigo-700 hover:underline">
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
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
