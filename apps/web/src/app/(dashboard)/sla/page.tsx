"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

async function fetchSla() {
  const res = await fetch("/api/sla", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch SLA data");
  return res.json();
}

export default function SLAPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["sla"],
    queryFn: fetchSla,
  });

  const breaches = data?.breaches ?? [];
  const ordersAtRisk = data?.ordersAtRisk ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">SLA & breaches</h1>
      <div className="grid gap-6 md:grid-cols-2">
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
                {breaches.map((b: { id: number; order: { orderNumber: string }; division: { name: string }; breachedAt: string }) => (
                  <li key={b.id} className="flex items-center justify-between text-sm">
                    <span>{b.order?.orderNumber} — {b.division?.name}</span>
                    <Badge variant="destructive">{new Date(b.breachedAt).toLocaleString()}</Badge>
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
                {ordersAtRisk.map((o: { id: number; orderNumber: string; slaDeadline: string }) => (
                  <li key={o.id} className="text-sm">
                    {o.orderNumber} — SLA was {new Date(o.slaDeadline).toLocaleString()}
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
