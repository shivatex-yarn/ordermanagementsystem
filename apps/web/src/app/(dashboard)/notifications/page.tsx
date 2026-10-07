"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Package,
  CheckCircle2,
  ArrowLeftRight,
  XCircle,
  Inbox,
  CircleCheck,
  AlertTriangle,
  Sparkles,
  FlaskConical,
  Truck,
  MessageSquareQuote,
  Bell,
  Check,
  Ban,
  type LucideIcon,
} from "lucide-react";
import { Panel, PageHeader, EmptyState } from "@/components/ui/panel";
import { cn } from "@/lib/utils";

type EnrichedNotification = {
  id: number;
  type: string;
  read: boolean;
  createdAt: string;
  enquiryNumberDisplay: string;
  label: string;
  summary: string;
  actor: { id: number; name: string; email: string } | null;
  orderId?: number | null;
};

const TYPE_ICONS: Record<string, LucideIcon> = {
  OrderCreated: Package,
  OrderAccepted: CheckCircle2,
  OrderTransferred: ArrowLeftRight,
  OrderRejected: XCircle,
  OrderCancelled: Ban,
  OrderReceived: Inbox,
  OrderCompleted: CircleCheck,
  SLABreachDetected: AlertTriangle,
  SampleDetailsUpdated: Sparkles,
  SampleApproved: FlaskConical,
  SampleShipped: Truck,
  SalesFeedbackRecorded: MessageSquareQuote,
  SLABreachHeadRejectionSubmitted: AlertTriangle,
};

/**
 * Notification tone. Only the genuinely urgent types get a warm colour — if
 * everything shouts, nothing does.
 */
function toneFor(type: string): "late" | "done" | "act" | "neutral" {
  if (type.startsWith("SLABreach")) return "late";
  if (type === "OrderRejected" || type === "OrderCancelled") return "late";
  if (type === "OrderCompleted" || type === "SampleApproved" || type === "OrderAccepted") return "done";
  if (type === "OrderCreated" || type === "OrderTransferred" || type === "SampleShipped") return "act";
  return "neutral";
}

const TONE_ICON: Record<string, string> = {
  late: "bg-[var(--app-late-bg)] text-[var(--app-late-ink)]",
  done: "bg-[var(--app-done-bg)] text-[var(--app-done-ink)]",
  act: "bg-[var(--app-brand-tint)] text-[var(--app-brand)]",
  neutral: "bg-[var(--app-surface-sunk)] text-[var(--app-ink-2)]",
};

async function fetchNotifications() {
  const res = await fetch("/api/notifications?limit=50", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch notifications");
  return res.json() as Promise<{ notifications: EnrichedNotification[] }>;
}

/** Relative for anything recent, absolute once it stops being "the other day". */
function formatWhen(iso: string): string {
  const then = new Date(iso);
  const diffMin = Math.round((Date.now() - then.getTime()) / 60000);
  if (Number.isNaN(diffMin)) return iso;
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffMin < 1440) return `${Math.floor(diffMin / 60)} hr ago`;
  if (diffMin < 10080) return `${Math.floor(diffMin / 1440)} day${diffMin < 2880 ? "" : "s"} ago`;
  return then.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function exactWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const { data, isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: fetchNotifications,
  });

  const markReadMutation = useMutation({
    mutationFn: (ids: number[]) =>
      fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ids }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notifications-unread-count"] });
    },
  });

  const notifications = data?.notifications ?? [];
  const unreadIds = useMemo(() => notifications.filter((n) => !n.read).map((n) => n.id), [notifications]);
  const unreadCount = unreadIds.length;
  const visible = filter === "unread" ? notifications.filter((n) => !n.read) : notifications;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Notifications"
        description={
          unreadCount > 0
            ? `${unreadCount} update${unreadCount === 1 ? "" : "s"} you have not read yet.`
            : "Everything that has happened on your enquiries. You are all caught up."
        }
      >
        {unreadCount > 0 ? (
          <button
            type="button"
            disabled={markReadMutation.isPending}
            onClick={() => markReadMutation.mutate(unreadIds)}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--app-line)] bg-white px-3.5 text-sm font-semibold text-[var(--app-ink-2)] hover:bg-[var(--app-surface-sunk)] disabled:opacity-60"
          >
            <Check className="h-4 w-4" aria-hidden />
            {markReadMutation.isPending ? "Marking…" : "Mark all read"}
          </button>
        ) : null}
      </PageHeader>

      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--app-line-soft)] px-5 py-3.5">
          <div className="flex gap-1.5" role="group" aria-label="Filter notifications">
            {(["all", "unread"] as const).map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-semibold",
                  filter === f
                    ? "bg-[var(--app-brand)] text-white"
                    : "border border-[var(--app-line)] text-[var(--app-ink-2)] hover:bg-[var(--app-surface-sunk)]"
                )}
              >
                {f === "all" ? `All (${notifications.length})` : `Unread (${unreadCount})`}
              </button>
            ))}
          </div>
          <p className="text-xs text-[var(--app-ink-3)]">Newest first</p>
        </div>

        {isLoading ? (
          <div className="space-y-2 p-5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-[var(--app-surface-sunk)]" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={Bell}
            title={filter === "unread" ? "Nothing unread" : "No notifications yet"}
            description={
              filter === "unread"
                ? "You have read everything. New updates will appear here as they happen."
                : "When something changes on your enquiries, it will show up here."
            }
          />
        ) : (
          <ul className="divide-y divide-[var(--app-line-soft)]">
            {visible.map((n) => {
              const Icon = TYPE_ICONS[n.type] ?? Bell;
              const tone = toneFor(n.type);
              return (
                <li
                  key={n.id}
                  className={cn(
                    "relative flex gap-4 px-5 py-4",
                    !n.read && "bg-[var(--app-brand-tint)]/40"
                  )}
                >
                  {!n.read ? (
                    <span
                      className="absolute left-0 top-0 h-full w-[3px] bg-[var(--app-brand)]"
                      aria-hidden
                    />
                  ) : null}

                  <span
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                      TONE_ICON[tone]
                    )}
                  >
                    <Icon className="h-4.5 w-4.5" aria-hidden />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--app-ink-3)]">
                        {n.label}
                      </span>
                      {!n.read ? (
                        <span className="rounded-full bg-[var(--app-brand)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                          New
                        </span>
                      ) : null}
                    </div>

                    <p className="mt-1 text-sm font-semibold leading-relaxed text-[var(--app-ink)]">
                      {n.summary}
                    </p>

                    <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--app-ink-3)]">
                      {n.orderId ? (
                        <Link
                          href={`/orders/${n.orderId}`}
                          className="tnum font-semibold text-[var(--app-brand)] hover:underline"
                        >
                          {n.enquiryNumberDisplay}
                        </Link>
                      ) : (
                        <span className="tnum font-semibold text-[var(--app-ink-2)]">
                          {n.enquiryNumberDisplay}
                        </span>
                      )}
                      {n.actor ? (
                        <>
                          <span aria-hidden>·</span>
                          <span>
                            by <span className="font-semibold text-[var(--app-ink-2)]">{n.actor.name}</span>
                          </span>
                        </>
                      ) : null}
                      <span aria-hidden>·</span>
                      <time dateTime={n.createdAt} title={exactWhen(n.createdAt)}>
                        {formatWhen(n.createdAt)}
                      </time>
                    </p>
                  </div>

                  {!n.read ? (
                    <button
                      type="button"
                      onClick={() => markReadMutation.mutate([n.id])}
                      disabled={markReadMutation.isPending}
                      className="h-8 shrink-0 self-start rounded-lg px-2.5 text-xs font-semibold text-[var(--app-ink-2)] hover:bg-white disabled:opacity-60"
                    >
                      Mark read
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
