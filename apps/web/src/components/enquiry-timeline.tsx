"use client";

/**
 * EnquiryTimeline — drop-in widget rendered on the enquiry detail page.
 *
 * Fetches /api/orders/[id]/timeline and renders the full workflow timeline:
 * creation → approval → classification → sample → handoff → feedback → closure
 * — with timestamps, actor names, and the original reasons captured at each step.
 */

import { useQuery } from "@tanstack/react-query";
import {
  AlertOctagon,
  ArrowRightLeft,
  CheckCircle2,
  Clock,
  MessageSquare,
  Package,
  PackageCheck,
  RotateCw,
  ShieldAlert,
  Truck,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Event = {
  id: number;
  type: string;
  title: string;
  detail: string | null;
  createdAt: string;
  actor: { id: number; name: string; email: string; role: string } | null;
};

const ICONS: Record<string, { icon: React.ComponentType<{ className?: string }>; tone: string }> = {
  ENQUIRY_CREATED: { icon: Package, tone: "bg-slate-900 text-white" },
  ENQUIRY_APPROVED: { icon: CheckCircle2, tone: "bg-emerald-100 text-emerald-700" },
  ENQUIRY_REJECTED: { icon: XCircle, tone: "bg-red-100 text-red-700" },
  ENQUIRY_TRANSFERRED: { icon: ArrowRightLeft, tone: "bg-blue-100 text-blue-700" },
  ENQUIRY_RECEIVED: { icon: PackageCheck, tone: "bg-blue-100 text-blue-700" },
  ENQUIRY_COMPLETED: { icon: CheckCircle2, tone: "bg-slate-100 text-slate-700" },
  ENQUIRY_CANCELLED: { icon: XCircle, tone: "bg-slate-100 text-slate-500" },
  PRODUCT_CLASSIFIED: { icon: Package, tone: "bg-amber-100 text-amber-700" },
  SAMPLE_REQUESTED: { icon: Package, tone: "bg-slate-100 text-slate-700" },
  SAMPLE_DETAILS_SUBMITTED: { icon: Package, tone: "bg-slate-100 text-slate-700" },
  SAMPLE_APPROVED_BY_HEAD: { icon: CheckCircle2, tone: "bg-emerald-100 text-emerald-700" },
  SAMPLE_APPROVED: { icon: CheckCircle2, tone: "bg-emerald-100 text-emerald-700" },
  SAMPLE_SHIPPED: { icon: Truck, tone: "bg-blue-100 text-blue-700" },
  SAMPLE_RECEIVED: { icon: PackageCheck, tone: "bg-emerald-100 text-emerald-700" },
  CUSTOMER_FEEDBACK: { icon: MessageSquare, tone: "bg-slate-900 text-white" },
  PRIORITY_CHANGED: { icon: RotateCw, tone: "bg-slate-100 text-slate-700" },
  SLA_BREACHED: { icon: AlertOctagon, tone: "bg-red-100 text-red-700" },
  SLA_HEAD_REJECTION: { icon: ShieldAlert, tone: "bg-amber-100 text-amber-700" },
  DELAY_REASON_SUBMITTED: { icon: ShieldAlert, tone: "bg-amber-100 text-amber-700" },
  HANDOFF_SUBMITTED: { icon: ArrowRightLeft, tone: "bg-blue-100 text-blue-700" },
  COMMENT: { icon: MessageSquare, tone: "bg-slate-100 text-slate-700" },
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString();
}

export function EnquiryTimeline({ enquiryId }: { enquiryId: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["enquiry-timeline", enquiryId],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${enquiryId}/timeline`, { credentials: "include" });
      if (!res.ok) return { events: [] as Event[] };
      return (await res.json()) as { events: Event[] };
    },
    staleTime: 30_000,
    refetchInterval: 90_000,
  });

  const events = data?.events ?? [];

  return (
    <section className="rounded-xl border border-slate-200/70 bg-white">
      <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Workflow timeline</h2>
          <p className="text-xs text-slate-500">Every step in this enquiry — newest first.</p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
          <Clock className="h-3 w-3" /> {events.length} events
        </span>
      </header>
      <div className="px-5 py-4">
        {isLoading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : events.length === 0 ? (
          <p className="text-sm text-slate-500">No timeline events yet.</p>
        ) : (
          <ol className="relative space-y-4 border-l border-slate-200 pl-6">
            {events.map((e) => {
              const meta = ICONS[e.type] ?? { icon: Clock, tone: "bg-slate-100 text-slate-700" };
              const Icon = meta.icon;
              return (
                <li key={e.id} className="relative">
                  <span
                    className={cn(
                      "absolute -left-[1.95rem] top-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full ring-4 ring-white",
                      meta.tone
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-medium text-slate-900">{e.title}</p>
                    <p className="shrink-0 text-xs text-slate-500">{formatDate(e.createdAt)}</p>
                  </div>
                  {e.detail ? <p className="mt-0.5 text-sm text-slate-600">{e.detail}</p> : null}
                  {e.actor ? (
                    <p className="mt-0.5 text-xs text-slate-500">
                      by {e.actor.name} · {e.actor.role.replace("_", " ")}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
