"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type OrderAtRisk = { id: number; orderNumber: string; slaDeadline: string };

async function fetchSla(): Promise<{ breaches: SlaBreachListItem[]; ordersAtRisk: OrderAtRisk[] }> {
  const res = await fetch("/api/sla", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch SLA data");
  return res.json();
}

export default function SLAPage() {
  const { data, isLoading } = useQuery<Awaited<ReturnType<typeof fetchSla>>>({
    queryKey: ["sla"],
    queryFn: fetchSla,
  });

  const breaches = data?.breaches ?? [];
  const ordersAtRisk = data?.ordersAtRisk ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">SLA & breaches</h1>
      <div className="grid gap-6 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>SLA breaches</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="py-4 text-slate-500">Loading...</div>
            ) : !breaches.length ? (
              <div className="py-4 text-slate-500">No breaches recorded.</div>
            ) : (
              <ul className="space-y-2">
                {breaches.map((b: SlaBreachListItem) => (
                  <li key={b.id} className="flex flex-col gap-1 rounded-lg border border-slate-100 bg-white px-3 py-2 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        {b.order?.id != null ? (
                          <Link href={`/orders/${b.order.id}`} className="font-medium text-indigo-700 hover:underline">
                            {b.order.orderNumber ?? "Unknown order"}
                          </Link>
                        ) : (
                          b.order?.orderNumber ?? "Unknown order"
                        )}{" "}
                        — {b.division?.name ?? "Unknown division"}
                      </span>
                      <Badge variant="destructive">{new Date(b.breachedAt).toLocaleString()}</Badge>
                    </div>
                    <div className="text-xs text-slate-600">
                      {b.headRejectedAt ? (
                        <span>
                          Head rejection submitted{" "}
                          <span className="font-mono">{new Date(b.headRejectedAt).toLocaleString()}</span>
                          {b.headRejectedBy?.name ? <> by <span className="font-medium">{b.headRejectedBy.name}</span></> : null}
                          {b.headRejectionMessage ? (
                            <span className="block mt-1 whitespace-pre-wrap text-slate-700">{b.headRejectionMessage}</span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="text-amber-700 font-medium">Awaiting Division Head rejection message</span>
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
            <CardTitle>Orders at risk</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="py-4 text-slate-500">Loading...</div>
            ) : !ordersAtRisk.length ? (
              <div className="py-4 text-slate-500">No orders past SLA deadline.</div>
            ) : (
              <ul className="space-y-2">
                {ordersAtRisk.map((o: OrderAtRisk) => (
                  <li key={o.id} className="text-sm">
                    <Link href={`/orders/${o.id}`} className="font-medium text-indigo-700 hover:underline">
                      {o.orderNumber}
                    </Link>{" "}
                    — SLA was {new Date(o.slaDeadline).toLocaleString()}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
