"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Overview = {
  statusCounts: Record<string, number>;
  openBreaches: number;
  delayedEnquiries: Array<{
    id: number;
    orderNumber: string;
    status: string;
    slaDeadline: string | null;
    currentDivision: { id: number; name: string };
  }>;
  recentBreaches: Array<{
    id: number;
    breachedAt: string;
    order: { id: number; orderNumber: string; status: string };
    division: { id: number; name: string };
  }>;
};

async function fetchOverview(): Promise<Overview> {
  const res = await fetch("/api/md/overview", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load overview");
  return res.json();
}

export default function MdOverviewPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["md-overview"],
    queryFn: fetchOverview,
  });

  if (isLoading) {
    return <div className="text-slate-500">Loading executive overview…</div>;
  }
  if (error || !data) {
    return (
      <div className="rounded-lg border border-red-100 bg-red-50 text-red-800 px-4 py-3 text-sm">
        Could not load overview. You may not have access (MD or Super Admin only).
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Executive overview</h1>
          <p className="text-slate-500 mt-1 max-w-2xl">
            Escalations (SLA breaches), delayed enquiries awaiting Division Head response, and enquiry
            status across the organisation. 48-hour response SLA applies while an enquiry is{" "}
            <strong>Placed</strong> or <strong>Transferred</strong> to a division.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/sla">Full SLA & breaches</Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Open SLA breaches</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold text-slate-900">{data.openBreaches}</p>
            <p className="text-xs text-slate-500 mt-1">Recorded when deadline passes without accept/reject</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Delayed (past deadline)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold text-slate-900">{data.delayedEnquiries.length}</p>
            <p className="text-xs text-slate-500 mt-1">Shown up to 50; still awaiting head action</p>
          </CardContent>
        </Card>
        {["PLACED", "IN_PROGRESS", "TRANSFERRED", "COMPLETED"].map((s) => (
          <Card key={s}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">{s.replace("_", " ")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold text-slate-900">{data.statusCounts[s] ?? 0}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Delayed enquiries</CardTitle>
          <p className="text-sm text-slate-500">Past 48h SLA deadline — needs attention</p>
        </CardHeader>
        <CardContent>
          {!data.delayedEnquiries.length ? (
            <p className="text-slate-500 text-sm">No delayed enquiries right now.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.delayedEnquiries.map((o) => (
                <li key={o.id} className="py-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <Link href={`/orders/${o.id}`} className="font-medium text-slate-900 hover:underline">
                      {o.orderNumber}
                    </Link>
                    <span className="text-slate-500 text-sm ml-2">{o.currentDivision.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{o.status}</Badge>
                    {o.slaDeadline && (
                      <span className="text-xs text-red-600">
                        Due {new Date(o.slaDeadline).toLocaleString()}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent escalations (open breaches)</CardTitle>
        </CardHeader>
        <CardContent>
          {!data.recentBreaches.length ? (
            <p className="text-slate-500 text-sm">No open breach records.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.recentBreaches.map((b) => (
                <li key={b.id} className="py-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <Link
                      href={`/orders/${b.order.id}`}
                      className="font-medium text-slate-900 hover:underline"
                    >
                      {b.order.orderNumber}
                    </Link>
                    <span className="text-slate-500 text-sm ml-2">{b.division.name}</span>
                  </div>
                  <span className="text-xs text-slate-500">
                    {new Date(b.breachedAt).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
