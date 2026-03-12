"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Request = {
  id: number;
  reason: string;
  status: string;
  createdAt: string;
  user: { id: number; name: string; email: string };
  approvedBy?: { id: number; name: string; email: string } | null;
  divisions: { division: { id: number; name: string } }[];
};

async function fetchRequests(status?: string): Promise<{ requests: Request[] }> {
  const url = status ? `/api/admin/multi-division-requests?status=${status}` : "/api/admin/multi-division-requests";
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch requests");
  return res.json();
}

export default function AdminMultiDivisionPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("PENDING");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-multi-division-requests", statusFilter],
    queryFn: () => fetchRequests(statusFilter),
  });
  const requests = data?.requests ?? [];

  const approveMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/multi-division-requests/${id}/approve`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to approve");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-multi-division-requests"] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/multi-division-requests/${id}/reject`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reject");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-multi-division-requests"] });
    },
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Multi-division access requests</h1>
        <p className="text-slate-500 mt-1">
          Division Heads can request access to multiple divisions. Approve or reject here.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Requests</CardTitle>
            <div className="flex gap-2">
              {["PENDING", "APPROVED", "REJECTED"].map((s) => (
                <Button
                  key={s}
                  variant={statusFilter === s ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStatusFilter(s)}
                >
                  {s.charAt(0) + s.slice(1).toLowerCase()}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-slate-500">Loading...</div>
          ) : !requests.length ? (
            <div className="py-8 text-center text-slate-500">
              No {statusFilter.toLowerCase()} requests.
            </div>
          ) : (
            <ul className="space-y-4">
              {requests.map((r) => (
                <li
                  key={r.id}
                  className="rounded-lg border border-slate-100 p-4 space-y-2"
                >
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <span className="font-medium">{r.user.name}</span>
                      <span className="text-slate-500 text-sm ml-2">({r.user.email})</span>
                    </div>
                    <Badge
                      variant={
                        r.status === "APPROVED"
                          ? "success"
                          : r.status === "REJECTED"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {r.status}
                    </Badge>
                  </div>
                  <p className="text-sm text-slate-600">
                    <span className="font-medium">Requested divisions:</span>{" "}
                    {r.divisions.map((d) => d.division.name).join(", ")}
                  </p>
                  <p className="text-sm text-slate-600">
                    <span className="font-medium">Reason:</span> {r.reason}
                  </p>
                  <p className="text-xs text-slate-500">
                    Submitted {new Date(r.createdAt).toLocaleString()}
                    {r.approvedBy && ` · Processed by ${r.approvedBy.name}`}
                  </p>
                  {r.status === "PENDING" && (
                    <div className="flex gap-2 pt-2">
                      <Button
                        size="sm"
                        onClick={() => approveMutation.mutate(r.id)}
                        disabled={approveMutation.isPending}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => rejectMutation.mutate(r.id)}
                        disabled={rejectMutation.isPending}
                      >
                        Reject
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
