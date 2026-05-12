"use client";

/**
 * NewDevelopmentModal — opens automatically when the Division Head classifies an
 * enquiry as New Development. Captures the full planning popup:
 *   • new development description
 *   • resource / material requirements
 *   • R&D requirements
 *   • estimated development timeline
 *   • expected completion duration
 *   • why the new development is needed
 *   • internal planning notes (optional)
 *
 * On submit it POSTs to /api/orders/:id/new-development-plan. A separate
 * "Mark planning complete" button (rendered inline) triggers
 * /api/orders/:id/complete-planning which sets the enquiry response deadline.
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Plan = {
  newDevDescription: string;
  newDevResources: string;
  newDevRandD: string;
  newDevTimeline: string;
  newDevCompletionDuration: string;
  newDevWhyNeeded: string;
  newDevNotes: string;
};

const EMPTY: Plan = {
  newDevDescription: "",
  newDevResources: "",
  newDevRandD: "",
  newDevTimeline: "",
  newDevCompletionDuration: "",
  newDevWhyNeeded: "",
  newDevNotes: "",
};

export function NewDevelopmentModal({
  enquiryId,
  open,
  onOpenChange,
  initial,
}: {
  enquiryId: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: Partial<Plan>;
}) {
  const queryClient = useQueryClient();
  const [plan, setPlan] = useState<Plan>({ ...EMPTY, ...initial });
  const [err, setErr] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/orders/${enquiryId}/new-development-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(plan),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `Save failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order", enquiryId] });
      onOpenChange(false);
    },
    onError: (e) => setErr((e as Error).message),
  });

  function set<K extends keyof Plan>(k: K, v: Plan[K]) {
    setPlan((p) => ({ ...p, [k]: v }));
  }

  function valid(): boolean {
    if (plan.newDevDescription.trim().length < 20) return false;
    if (plan.newDevResources.trim().length < 10) return false;
    if (plan.newDevRandD.trim().length < 10) return false;
    if (!plan.newDevTimeline.trim()) return false;
    if (!plan.newDevCompletionDuration.trim()) return false;
    if (plan.newDevWhyNeeded.trim().length < 20) return false;
    return true;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>New Development planning</DialogTitle>
          <DialogDescription>Submit the planning details below.</DialogDescription>
        </DialogHeader>

        {/* Stage indicators — fill as the head completes each section */}
        <div className="grid grid-cols-4 gap-2 text-[10px] uppercase tracking-wider">
          {[
            { label: "Scope",     done: plan.newDevDescription.trim().length >= 20 },
            { label: "Resources", done: plan.newDevResources.trim().length >= 10 && plan.newDevRandD.trim().length >= 10 },
            { label: "Timeline",  done: Boolean(plan.newDevTimeline.trim() && plan.newDevCompletionDuration.trim()) },
            { label: "Rationale", done: plan.newDevWhyNeeded.trim().length >= 20 },
          ].map((s) => (
            <div
              key={s.label}
              className={`rounded-md border px-2 py-1 text-center font-medium ${
                s.done
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-slate-200 bg-slate-50 text-slate-500"
              }`}
            >
              {s.done ? "✓" : "•"} {s.label}
            </div>
          ))}
        </div>

        {err ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {err}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2 space-y-1.5">
            <Label htmlFor="ndDesc">New development description (min 20)</Label>
            <textarea
              id="ndDesc"
              rows={3}
              value={plan.newDevDescription}
              onChange={(e) => set("newDevDescription", e.target.value)}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
              placeholder="What product / variant is being developed?"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ndRes">Resource / material requirements</Label>
            <textarea
              id="ndRes"
              rows={3}
              value={plan.newDevResources}
              onChange={(e) => set("newDevResources", e.target.value)}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
              placeholder="Yarn count, dyes, additional machinery..."
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ndRandD">R&amp;D requirements</Label>
            <textarea
              id="ndRandD"
              rows={3}
              value={plan.newDevRandD}
              onChange={(e) => set("newDevRandD", e.target.value)}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
              placeholder="Lab trials, finish development, test methods..."
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ndTimeline">Estimated development timeline</Label>
            <Input
              id="ndTimeline"
              value={plan.newDevTimeline}
              onChange={(e) => set("newDevTimeline", e.target.value)}
              placeholder="e.g. 3 weeks (lab) + 1 week pilot"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ndDur">Expected completion duration</Label>
            <Input
              id="ndDur"
              value={plan.newDevCompletionDuration}
              onChange={(e) => set("newDevCompletionDuration", e.target.value)}
              placeholder="e.g. 30 working days"
            />
          </div>
          <div className="sm:col-span-2 space-y-1.5">
            <Label htmlFor="ndWhy">Why is this new development required? (min 20)</Label>
            <textarea
              id="ndWhy"
              rows={3}
              value={plan.newDevWhyNeeded}
              onChange={(e) => set("newDevWhyNeeded", e.target.value)}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
              placeholder="Customer ask, competitive opportunity, regulatory change..."
            />
          </div>
          <div className="sm:col-span-2 space-y-1.5">
            <Label htmlFor="ndNotes">Internal planning notes (optional)</Label>
            <textarea
              id="ndNotes"
              rows={3}
              value={plan.newDevNotes}
              onChange={(e) => set("newDevNotes", e.target.value)}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
              placeholder="Risks, dependencies, internal context..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submit.isPending}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              setErr(null);
              if (!valid()) {
                setErr("Fill every required field (note the minimum lengths).");
                return;
              }
              submit.mutate();
            }}
            disabled={submit.isPending}
            className="bg-slate-900 text-white hover:bg-slate-800"
          >
            {submit.isPending ? "Saving…" : "Save planning"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
