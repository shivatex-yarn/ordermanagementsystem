"use client";

/**
 * SLA Delay-Reason Gate.
 *
 * Mounted inside the dashboard layout. On mount it queries /api/sla/gate; if the
 * current Division Head has any unexplained, open SLA breaches, this overlay locks
 * the rest of the app until a delay reason is submitted for each one.
 *
 * Visible only to Division Heads (DIVISION_HEAD / MANAGER); other roles see nothing.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertOctagon, Clock, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type PendingBreach = {
  breachId: number;
  breachedAt: string;
  division: { id: number; name: string };
  order: {
    id: number;
    orderNumber: string;
    companyName: string | null;
    status: string;
    priority: string;
    createdAt: string;
  };
  headRejectionMessage: string | null;
  headRejectedAt: string | null;
};

function formatDuration(fromIso: string): string {
  const ms = Date.now() - new Date(fromIso).getTime();
  const hours = ms / 3_600_000;
  if (hours < 24) return `${Math.floor(hours)}h overdue`;
  return `${Math.floor(hours / 24)}d ${Math.floor(hours % 24)}h overdue`;
}

export function SLAGate() {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [activeId, setActiveId] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["sla-gate"],
    queryFn: async () => {
      const res = await fetch("/api/sla/gate", { credentials: "include" });
      if (!res.ok) return { pending: [] as PendingBreach[] };
      return (await res.json()) as { pending: PendingBreach[] };
    },
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });

  const submit = useMutation({
    mutationFn: async ({ breachId, reasonText }: { breachId: number; reasonText: string }) => {
      const res = await fetch("/api/sla/delay-reason", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ breachId, reason: reasonText }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? "Failed to submit delay reason");
      }
      return res.json();
    },
    onSuccess: () => {
      setReason("");
      setActiveId(null);
      queryClient.invalidateQueries({ queryKey: ["sla-gate"] });
    },
  });

  const pending = data?.pending ?? [];
  if (isLoading || pending.length === 0) return null;

  // Pick the first breach to focus on; the user must work through them one at a time.
  const focus = pending.find((p) => p.breachId === activeId) ?? pending[0];

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/85 p-4 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-white shadow-2xl">
        <div className="flex items-center gap-3 border-b border-slate-100 px-6 py-5">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-red-50 ring-1 ring-red-100">
            <AlertOctagon className="h-5 w-5 text-red-600" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900">
              SLA delay reason required before you can continue
            </h2>
            <p className="text-xs text-slate-500">
              {pending.length} enquir{pending.length === 1 ? "y has" : "ies have"} breached the 48-hour SLA in your
              division. Submit a delay reason for each one to unlock the rest of the application.
            </p>
          </div>
        </div>

        <div className="grid gap-4 px-6 py-5 sm:grid-cols-[1.4fr_1fr]">
          <div>
            <div className="rounded-lg border border-slate-200 bg-slate-50/40 p-4">
              <p className="font-mono text-sm font-semibold text-slate-900">{focus.order.orderNumber}</p>
              <p className="mt-0.5 truncate text-sm text-slate-700">{focus.order.companyName ?? "—"}</p>
              <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
                <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 font-medium text-red-700 ring-1 ring-red-100">
                  <Clock className="h-3 w-3" /> {formatDuration(focus.breachedAt)}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
                  <Building2 className="h-3 w-3" /> {focus.division.name}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-2 py-0.5 font-medium text-white">
                  {focus.order.status}
                </span>
                {focus.order.priority !== "NORMAL" ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700 ring-1 ring-amber-100">
                    {focus.order.priority}
                  </span>
                ) : null}
              </div>
            </div>
            <label className="mt-4 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Delay reason
            </label>
            <textarea
              className="mt-1 w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
              rows={5}
              placeholder="Describe the cause and corrective action — minimum 10 characters."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <p className="mt-1 text-xs text-slate-500">
              This will be visible to the MD and Super Admin dashboards.
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <Button
                type="button"
                disabled={submit.isPending || reason.trim().length < 10}
                onClick={() => submit.mutate({ breachId: focus.breachId, reasonText: reason })}
                className="bg-slate-900 text-white hover:bg-slate-800"
              >
                {submit.isPending ? "Submitting…" : "Submit and continue"}
              </Button>
            </div>
            {submit.error ? (
              <p className="mt-2 text-sm text-red-600">{(submit.error as Error).message}</p>
            ) : null}
          </div>

          {pending.length > 1 ? (
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="px-1 pb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                Other breached ({pending.length - 1})
              </p>
              <ul className="space-y-1">
                {pending
                  .filter((p) => p.breachId !== focus.breachId)
                  .map((p) => (
                    <li key={p.breachId}>
                      <button
                        type="button"
                        onClick={() => setActiveId(p.breachId)}
                        className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-slate-100"
                      >
                        <span className="truncate">
                          <span className="font-mono text-xs text-slate-700">{p.order.orderNumber}</span>{" "}
                          <span className="text-slate-500">· {p.division.name}</span>
                        </span>
                        <span className="shrink-0 text-xs text-red-600">{formatDuration(p.breachedAt)}</span>
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
