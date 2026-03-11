"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

async function fetchAudit(page = 1) {
  const res = await fetch(`/api/audit?page=${page}&limit=20`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch audit log");
  return res.json();
}

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ["audit", page],
    queryFn: () => fetchAudit(page),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Audit log</h1>
      <Card>
        <CardHeader>
          <CardTitle>Order events</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-slate-500">Loading...</div>
          ) : !data?.logs?.length ? (
            <div className="py-8 text-center text-slate-500">No audit entries.</div>
          ) : (
            <div className="space-y-2">
              {data.logs.map((log: { id: number; action: string; orderId: number; user?: { name: string }; createdAt: string }) => (
                <div key={log.id} className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 text-sm">
                  <span className="font-medium">{log.action}</span> — Order #{log.orderId}
                  {log.user && ` by ${log.user.name}`} — {new Date(log.createdAt).toLocaleString()}
                </div>
              ))}
              {data.total > data.limit && (
                <div className="flex justify-center gap-2 pt-4">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                  <Button variant="outline" size="sm" disabled={page * data.limit >= data.total} onClick={() => setPage((p) => p + 1)}>Next</Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
