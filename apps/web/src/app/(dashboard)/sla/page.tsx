"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type OrderAtRisk = { id: number; orderNumber: string; slaDeadline: string };

async function fetchSla(): Promise<{ breaches: SlaBreachListItem[]; ordersAtRisk: OrderAtRisk[] }> {
  const res = await fetch("/api/sla", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch SLA data");
  return res.json();
}

type SlaBreachListItem = {
  id: number;
  breachedAt: string;
  headRejectedAt?: string | null;
  headRejectionMessage?: string | null;
  headRejectedBy?: { name?: string | null } | null;
  division?: { name?: string | null } | null;
  order?: { id?: number | null; orderNumber?: string | null } | null;
};

const PAGE_SIZE = 5;

export default function SLAPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["sla"],
    queryFn: fetchSla,
  });

  const breaches = useMemo(() => data?.breaches ?? [], [data?.breaches]);
  const ordersAtRisk = useMemo(() => data?.ordersAtRisk ?? [], [data?.ordersAtRisk]);

  const [breachesPage, setBreachesPage] = useState(1);
  const [riskPage, setRiskPage] = useState(1);

  const breachesTotalPages = Math.max(1, Math.ceil(breaches.length / PAGE_SIZE));
  const riskTotalPages = Math.max(1, Math.ceil(ordersAtRisk.length / PAGE_SIZE));

  useEffect(() => {
    setBreachesPage((p) => Math.min(p, breachesTotalPages));
  }, [breachesTotalPages]);

  useEffect(() => {
    setRiskPage((p) => Math.min(p, riskTotalPages));
  }, [riskTotalPages]);

  const breachesSlice = useMemo(() => {
    const start = (breachesPage - 1) * PAGE_SIZE;
    return breaches.slice(start, start + PAGE_SIZE);
  }, [breaches, breachesPage]);

  const riskSlice = useMemo(() => {
    const start = (riskPage - 1) * PAGE_SIZE;
    return ordersAtRisk.slice(start, start + PAGE_SIZE);
  }, [ordersAtRisk, riskPage]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">SLA & breaches</h1>
      {error ? (
        <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-800">
          Could not load SLA data. Please retry in a moment.
        </div>
      ) : null}
      <div className="grid gap-6 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>SLA breaches</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="py-4 text-slate-500">Loading...</div>
            ) : error ? (
              <div className="py-4 text-slate-500">—</div>
            ) : !breaches.length ? (
              <div className="py-4 text-slate-500">No breaches recorded.</div>
            ) : (
              <div className="space-y-3">
                <ul className="space-y-2">
                  {breachesSlice.map((b: SlaBreachListItem) => (
                    <li
                      key={b.id}
                      className="flex flex-col gap-1 rounded-lg border border-slate-100 bg-white px-3 py-2 text-sm"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                          {b.order?.id != null ? (
                            <Link href={`/orders/${b.order.id}`} className="font-medium text-indigo-700 hover:underline">
                              {b.order.orderNumber}
                            </Link>
                          ) : (
                            b.order?.orderNumber
                          )}{" "}
                          — {b.division?.name}
                        </span>
                        <Badge variant="destructive">{new Date(b.breachedAt).toLocaleString()}</Badge>
                      </div>
                      <div className="text-xs text-slate-600">
                        {b.headRejectedAt ? (
                          <span>
                            Head rejection submitted{" "}
                            <span className="font-mono">{new Date(b.headRejectedAt).toLocaleString()}</span>
                            {b.headRejectedBy?.name ? (
                              <>
                                {" "}
                                by <span className="font-medium">{b.headRejectedBy.name}</span>
                              </>
                            ) : null}
                            {b.headRejectionMessage ? (
                              <span className="mt-1 block whitespace-pre-wrap text-slate-700">
                                {b.headRejectionMessage}
                              </span>
                            ) : null}
                          </span>
                        ) : (
                          <span className="font-medium text-amber-700">Awaiting Division Head rejection message</span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50/50 px-1 pt-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-slate-500">
                    Page {breachesPage} of {breachesTotalPages} · {breaches.length} breach
                    {breaches.length === 1 ? "" : "es"}
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
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Orders at risk</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="py-4 text-slate-500">Loading...</div>
            ) : error ? (
              <div className="py-4 text-slate-500">—</div>
            ) : !ordersAtRisk.length ? (
              <div className="py-4 text-slate-500">No orders past SLA deadline.</div>
            ) : (
              <div className="space-y-3">
                <ul className="space-y-2">
                  {riskSlice.map((o: OrderAtRisk) => (
                    <li key={o.id} className="text-sm">
                      <Link href={`/orders/${o.id}`} className="font-medium text-indigo-700 hover:underline">
                        {o.orderNumber}
                      </Link>{" "}
                      — SLA was {new Date(o.slaDeadline).toLocaleString()}
                    </li>
                  ))}
                </ul>
                <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50/50 px-1 pt-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-slate-500">
                    Page {riskPage} of {riskTotalPages} · {ordersAtRisk.length} order
                    {ordersAtRisk.length === 1 ? "" : "s"}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8"
                      disabled={riskPage <= 1}
                      onClick={() => setRiskPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8"
                      disabled={riskPage >= riskTotalPages}
                      onClick={() => setRiskPage((p) => Math.min(riskTotalPages, p + 1))}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
