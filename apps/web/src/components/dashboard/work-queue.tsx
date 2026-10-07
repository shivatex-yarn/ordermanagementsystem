"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, Clock } from "lucide-react";
import { EmptyState } from "@/components/ui/panel";
import { PriorityPill } from "@/components/ui/status-pill";
import { formatEnquiryNumberShort } from "@/lib/enquiry-display";
import { cn } from "@/lib/utils";

export type ActionItem = {
  id: number;
  orderNumber: string;
  company: string | null;
  customer: string | null;
  status: string;
  priority: string;
  division: string | null;
  reason: string;
  actionLabel: string;
  ageDays: number;
  overdue: boolean;
};

/**
 * One row of the work queue: who it is for, why it is here, and the single
 * button that deals with it. The reason sentence is the point — a row without
 * one is just another number to decode.
 */
function QueueRow({ item, kind }: { item: ActionItem; kind: "act" | "wait" }) {
  const title = item.company || item.customer || "Enquiry";
  return (
    <li className="flex flex-wrap items-start gap-3 px-5 py-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="tnum rounded-md bg-[var(--app-surface-sunk)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--app-ink-2)]">
            {formatEnquiryNumberShort(item.orderNumber)}
          </span>
          <span className="min-w-0 truncate text-sm font-bold text-[var(--app-ink)]">{title}</span>
          <PriorityPill priority={item.priority === "NORMAL" ? null : item.priority} />
          {item.overdue ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--app-late-line)] bg-[var(--app-late-bg)] px-2 py-0.5 text-[10px] font-bold text-[var(--app-late-ink)]">
              <Clock className="h-3 w-3" aria-hidden />
              Overdue
            </span>
          ) : null}
        </div>

        <p className="mt-1 text-sm leading-relaxed text-[var(--app-ink-2)]">{item.reason}</p>

        <p className="mt-1 text-xs text-[var(--app-ink-3)]">
          {item.division ? `${item.division} · ` : ""}
          {item.ageDays === 0 ? "Opened today" : `${item.ageDays} day${item.ageDays === 1 ? "" : "s"} old`}
        </p>
      </div>

      <Link
        href={`/orders/${item.id}`}
        className={cn(
          "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3.5 text-xs font-bold",
          kind === "act"
            ? "bg-[var(--app-ink)] text-white hover:bg-black"
            : "border border-[var(--app-line)] text-[var(--app-ink-2)] hover:bg-[var(--app-surface-sunk)]"
        )}
      >
        {item.actionLabel}
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </Link>
    </li>
  );
}

export function WorkQueue({
  items,
  kind,
  total,
  emptyTitle,
  emptyDescription,
}: {
  items: ActionItem[];
  kind: "act" | "wait";
  total: number;
  emptyTitle: string;
  emptyDescription: string;
}) {
  if (items.length === 0) {
    return (
      <EmptyState icon={CheckCircle2} title={emptyTitle} description={emptyDescription} />
    );
  }
  return (
    <>
      <ul className="divide-y divide-[var(--app-line-soft)]">
        {items.map((item) => (
          <QueueRow key={`${kind}-${item.id}`} item={item} kind={kind} />
        ))}
      </ul>
      {total > items.length ? (
        <div className="border-t border-[var(--app-line-soft)] px-5 py-3">
          <Link
            href="/orders"
            className="text-xs font-semibold text-[var(--app-brand)] hover:underline"
          >
            {total - items.length} more — see every enquiry
          </Link>
        </div>
      ) : null}
    </>
  );
}
