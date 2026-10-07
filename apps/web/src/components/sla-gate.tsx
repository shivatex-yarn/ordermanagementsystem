"use client";

/**
 * SLA delay-reason gate.
 *
 * Mounted in the dashboard layout. A Division Head with unexplained, open SLA
 * breaches must record why each one ran late.
 *
 * Three things keep it humane:
 *
 *  - The whole list is visible up front, with progress, so nobody is dripped
 *    one surprise at a time.
 *  - Several enquiries delayed by the same cause can be explained together.
 *    Each still stores its own reason; only the typing is shared.
 *  - Past a handful outstanding, it can be deferred to a persistent banner.
 *    Locking someone out of their job to collect fifteen essays produces
 *    fifteen worthless essays.
 */

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertOctagon, Building2, CheckCircle2, Clock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatEnquiryNumberShort } from "@/lib/enquiry-display";
import { cn } from "@/lib/utils";

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

/** Below this many outstanding, the gate blocks. At or above, it can be deferred. */
const DEFER_THRESHOLD = 5;
const MIN_REASON = 10;
const DEFER_KEY = "sla-gate-deferred";

function formatDuration(fromIso: string): string {
  const hours = (Date.now() - new Date(fromIso).getTime()) / 3_600_000;
  if (hours < 24) return `${Math.floor(hours)}h overdue`;
  return `${Math.floor(hours / 24)}d overdue`;
}

export function SLAGate() {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [deferred, setDeferred] = useState(false);
  const [error, setError] = useState("");

  // Remember a deferral for the session, so a page reload does not re-trap them.
  useEffect(() => {
    try {
      if (sessionStorage.getItem(DEFER_KEY) === "1") setDeferred(true);
    } catch {
      // Private mode or blocked storage — the gate simply does not remember.
    }
  }, []);

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

  const pending = useMemo(() => data?.pending ?? [], [data]);

  // Default to everything ticked: the common case is one cause behind many delays.
  useEffect(() => {
    setSelected((prev) => {
      const next: Record<number, boolean> = {};
      for (const p of pending) next[p.breachId] = prev[p.breachId] ?? true;
      return next;
    });
  }, [pending]);

  const submit = useMutation({
    mutationFn: async ({ breachIds, reasonText }: { breachIds: number[]; reasonText: string }) => {
      const res = await fetch("/api/sla/delay-reason", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ breachIds, reason: reasonText }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        saved?: number;
        failures?: { breachId: number; error: string }[];
      };
      if (!res.ok) throw new Error(json.error ?? "Could not save the reason");
      return json;
    },
    onSuccess: (json) => {
      setReason("");
      setError(
        json.failures && json.failures.length > 0
          ? `Saved ${json.saved}. ${json.failures.length} could not be saved — they may have been resolved already.`
          : ""
      );
      queryClient.invalidateQueries({ queryKey: ["sla-gate"] });
      queryClient.invalidateQueries({ queryKey: ["sla"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const selectedIds = pending.filter((p) => selected[p.breachId]).map((p) => p.breachId);
  const canDefer = pending.length >= DEFER_THRESHOLD;
  const reasonTooShort = reason.trim().length < MIN_REASON;

  function defer() {
    try {
      sessionStorage.setItem(DEFER_KEY, "1");
    } catch {
      // Not remembering is fine; the banner still shows for this page view.
    }
    setDeferred(true);
  }

  function reopen() {
    try {
      sessionStorage.removeItem(DEFER_KEY);
    } catch {
      /* no-op */
    }
    setDeferred(false);
  }

  if (isLoading || pending.length === 0) return null;

  // ── Deferred: a banner that will not be mistaken for decoration ─────────
  if (deferred) {
    return (
      /* Fixed, not sticky: the layout's scroll container is the <main>, so a
         sticky element here would never pin to the viewport. */
      <div className="fixed inset-x-0 bottom-0 z-50 border-t-2 border-[var(--app-late-line)] bg-[var(--app-late-bg)] px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.12)]">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3">
          <AlertOctagon className="h-5 w-5 shrink-0 text-[var(--app-late-ink)]" aria-hidden />
          <p className="min-w-0 flex-1 text-sm font-bold text-[var(--app-late-ink)]">
            {pending.length} breached enquir{pending.length === 1 ? "y" : "ies"} in your division
            still need a delay reason.
          </p>
          <Button type="button" onClick={reopen} className="shrink-0">
            Record the reasons
          </Button>
        </div>
      </div>
    );
  }

  // ── The gate ────────────────────────────────────────────────────────────
  const explainedNote =
    pending.length === 1
      ? "One enquiry is waiting on an explanation."
      : `${pending.length} enquiries are waiting on an explanation.`;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-[var(--app-line-soft)] px-6 py-5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--app-late-bg)]">
            <AlertOctagon className="h-5 w-5 text-[var(--app-late-ink)]" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-[var(--app-ink)]">
              Why did these enquiries run late?
            </h2>
            <p className="mt-0.5 text-sm text-[var(--app-ink-2)]">
              {explainedNote} Tick everything that was delayed for the same reason and write it
              once — each enquiry is recorded separately.
            </p>
          </div>
          {canDefer ? (
            <button
              type="button"
              onClick={defer}
              aria-label="Do this later"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--app-ink-3)] hover:bg-[var(--app-surface-sunk)] hover:text-[var(--app-ink)]"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
        </div>

        {/* Progress */}
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--app-line-soft)] bg-[var(--app-surface-sunk)] px-6 py-3">
          <p className="tnum text-xs font-bold text-[var(--app-ink-2)]">
            {selectedIds.length} of {pending.length} selected
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() =>
                setSelected(Object.fromEntries(pending.map((p) => [p.breachId, true])))
              }
              className="rounded-lg border border-[var(--app-line)] bg-white px-2.5 py-1 text-xs font-semibold text-[var(--app-ink-2)] hover:bg-[var(--app-surface-sunk)]"
            >
              Select all
            </button>
            <button
              type="button"
              onClick={() => setSelected({})}
              className="rounded-lg border border-[var(--app-line)] bg-white px-2.5 py-1 text-xs font-semibold text-[var(--app-ink-2)] hover:bg-[var(--app-surface-sunk)]"
            >
              Clear
            </button>
          </div>
        </div>

        {/* The full list, up front */}
        <ul className="scroll-soft max-h-[38vh] divide-y divide-[var(--app-line-soft)] overflow-y-auto">
          {pending.map((p) => {
            const checked = Boolean(selected[p.breachId]);
            return (
              <li key={p.breachId}>
                <label
                  className={cn(
                    "flex cursor-pointer items-start gap-3 px-6 py-3.5",
                    checked ? "bg-[var(--app-brand-tint)]/40" : "hover:bg-[var(--app-surface-sunk)]"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) =>
                      setSelected((s) => ({ ...s, [p.breachId]: e.target.checked }))
                    }
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--app-brand)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="tnum rounded-md bg-[var(--app-surface-sunk)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--app-ink-2)]">
                        {formatEnquiryNumberShort(p.order.orderNumber)}
                      </span>
                      <span className="truncate text-sm font-bold text-[var(--app-ink)]">
                        {p.order.companyName ?? "Untitled enquiry"}
                      </span>
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--app-ink-3)]">
                      <span className="inline-flex items-center gap-1 font-semibold text-[var(--app-late-ink)]">
                        <Clock className="h-3 w-3" aria-hidden />
                        {formatDuration(p.breachedAt)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Building2 className="h-3 w-3" aria-hidden />
                        {p.division.name}
                      </span>
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>

        {/* One reason, applied to everything ticked */}
        <div className="border-t border-[var(--app-line-soft)] px-6 py-5">
          <label htmlFor="sla-reason" className="block text-xs font-bold uppercase tracking-wide text-[var(--app-ink-2)]">
            What caused the delay?
          </label>
          <textarea
            id="sla-reason"
            rows={3}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (error) setError("");
            }}
            placeholder="e.g. Spinning line down for maintenance from 2 Oct, customer samples rescheduled to 9 Oct."
            className="mt-2 w-full rounded-xl border border-[var(--app-line)] bg-white px-3.5 py-2.5 text-sm text-[var(--app-ink)] placeholder:text-[var(--app-ink-3)] focus:border-[var(--app-brand-line)] focus:outline-none focus:ring-2 focus:ring-[var(--app-brand)]/20"
            data-gramm="false"
          />
          <p className="mt-1.5 text-xs text-[var(--app-ink-3)]">
            At least {MIN_REASON} characters. This is recorded against each selected enquiry and is
            visible to the Managing Director.
          </p>

          {error ? (
            <p className="mt-3 rounded-xl border border-[var(--app-late-line)] bg-[var(--app-late-bg)] px-3 py-2 text-sm font-semibold text-[var(--app-late-ink)]">
              {error}
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              disabled={submit.isPending || selectedIds.length === 0 || reasonTooShort}
              onClick={() => {
                setError("");
                submit.mutate({ breachIds: selectedIds, reasonText: reason });
              }}
            >
              {submit.isPending ? (
                "Saving…"
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" aria-hidden />
                  Record for {selectedIds.length} enquir{selectedIds.length === 1 ? "y" : "ies"}
                </>
              )}
            </Button>

            {canDefer ? (
              <button
                type="button"
                onClick={defer}
                className="text-sm font-semibold text-[var(--app-ink-2)] underline-offset-4 hover:underline"
              >
                Do this later
              </button>
            ) : (
              <p className="text-xs text-[var(--app-ink-3)]">
                With {DEFER_THRESHOLD} or more outstanding you can defer this; below that it has to
                be done now.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
