"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";

type Division = { id: number; name: string; active?: boolean };

type AccessRequest = {
  id: number;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
  approvedAt?: string | null;
  approvedBy?: { id: number; name: string; email: string } | null;
  divisions: { division: { id: number; name: string } }[];
};

async function fetchDivisions(): Promise<{ divisions: Division[] }> {
  const res = await fetch("/api/divisions", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load divisions");
  return res.json();
}

async function fetchMyRequests(): Promise<{ requests: AccessRequest[] }> {
  const res = await fetch("/api/multi-division-requests", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load requests");
  return res.json();
}

export default function MultiDivisionAccessPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [reason, setReason] = useState("");
  const [submitError, setSubmitError] = useState("");

  const isManager = user?.role === "MANAGER";

  const { data: divisionsData, isLoading: divisionsLoading } = useQuery({
    queryKey: ["divisions", "all-active"],
    queryFn: fetchDivisions,
    enabled: Boolean(user && isManager),
    staleTime: 5 * 60_000,
  });

  const { data: requestsData, isLoading: requestsLoading } = useQuery({
    queryKey: ["multi-division-requests", "me"],
    queryFn: fetchMyRequests,
    enabled: Boolean(user && isManager),
    staleTime: 30_000,
  });

  const requests = requestsData?.requests ?? [];
  const hasPending = requests.some((r) => r.status === "PENDING");

  const selectableDivisions = useMemo(() => {
    const all = (divisionsData?.divisions ?? []).filter((d) => d.active !== false);
    return user?.divisionId ? all.filter((d) => d.id !== user.divisionId) : all;
  }, [divisionsData?.divisions, user?.divisionId]);

  const selectedDivisionIds = useMemo(
    () => Object.entries(selected).filter(([, v]) => v).map(([k]) => Number(k)),
    [selected]
  );

  const submitMutation = useMutation({
    mutationFn: async () => {
      setSubmitError("");
      const res = await fetch("/api/multi-division-requests", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim(), divisionIds: selectedDivisionIds }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof (data as { error?: unknown }).error === "string"
            ? (data as { error: string }).error
            : "Failed to submit request"
        );
      }
      return data;
    },
    onSuccess: () => {
      setReason("");
      setSelected({});
      queryClient.invalidateQueries({ queryKey: ["multi-division-requests", "me"] });
    },
    onError: (err: Error) => setSubmitError(err.message),
  });

  if (isLoading) {
    return <div className="text-slate-500">Loading…</div>;
  }

  if (!user) {
    router.replace("/login");
    return null;
  }

  if (!isManager) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Multi-division access</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-600">
          This page is only available to Division Heads (Managers).
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Multi-division access</h1>
        <p className="mt-1 text-slate-500">
          Request access to additional divisions. A Super Admin will review and approve or reject.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Submit a request</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3 text-slate-700">
            <span className="text-slate-500">Your current division:</span>{" "}
            {user.division?.name ?? "—"}
          </div>

          {divisionsLoading ? (
            <p className="text-slate-500">Loading divisions…</p>
          ) : selectableDivisions.length === 0 ? (
            <p className="text-slate-500">No divisions available to request.</p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Select divisions
              </p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {selectableDivisions.map((d) => (
                  <label
                    key={d.id}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(selected[d.id])}
                      onChange={(e) =>
                        setSelected((prev) => ({ ...prev, [d.id]: e.target.checked }))
                      }
                    />
                    <span className="text-slate-800">{d.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Reason (min 10 characters)</Label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why do you need access to these divisions?"
              rows={4}
              className="flex min-h-[96px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-xs placeholder:text-slate-400 focus-visible:border-slate-300 focus-visible:ring-slate-200/50 focus-visible:ring-[3px] outline-none"
            />
          </div>

          {hasPending ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              You already have a pending request. Please wait for approval before submitting another.
            </div>
          ) : null}

          {submitError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {submitError}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              disabled={
                submitMutation.isPending ||
                hasPending ||
                reason.trim().length < 10 ||
                selectedDivisionIds.length === 0
              }
              onClick={() => submitMutation.mutate()}
            >
              {submitMutation.isPending ? "Submitting…" : "Submit request"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={submitMutation.isPending}
              onClick={() => {
                setReason("");
                setSelected({});
                setSubmitError("");
              }}
            >
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your requests</CardTitle>
        </CardHeader>
        <CardContent>
          {requestsLoading ? (
            <div className="py-8 text-center text-slate-500">Loading…</div>
          ) : requests.length === 0 ? (
            <div className="py-8 text-center text-slate-500">No requests yet.</div>
          ) : (
            <ul className="space-y-4">
              {requests.map((r) => (
                <li key={r.id} className="rounded-lg border border-slate-100 p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-sm font-medium text-slate-900">
                      Submitted {new Date(r.createdAt).toLocaleString()}
                    </p>
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
                    <span className="font-medium">Divisions:</span>{" "}
                    {r.divisions.map((d) => d.division.name).join(", ")}
                  </p>
                  <p className="text-sm text-slate-600">
                    <span className="font-medium">Reason:</span> {r.reason}
                  </p>
                  {r.approvedBy ? (
                    <p className="text-xs text-slate-500">
                      Processed by {r.approvedBy.name}
                      {r.approvedAt ? ` · ${new Date(r.approvedAt).toLocaleString()}` : ""}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

