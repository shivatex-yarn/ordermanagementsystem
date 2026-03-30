"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { notificationCardStyles } from "@/lib/notification-ui-styles";
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

type EnrichedNotification = {
  id: number;
  type: string;
  read: boolean;
  createdAt: string;
  enquiryNumberDisplay: string;
  label: string;
  summary: string;
  actor: { id: number; name: string; email: string } | null;
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
};

async function fetchNotifications() {
  const res = await fetch("/api/notifications?limit=50", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch notifications");
  return res.json() as Promise<{ notifications: EnrichedNotification[] }>;
}

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
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
  const unreadCount = notifications.filter((n) => !n.read).length;
  const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Notifications</h1>
          <p className="mt-1 text-sm text-slate-500">
            Enquiry updates for your account{unreadCount > 0 ? ` · ${unreadCount} unread` : " · All caught up"}.
          </p>
        </div>
        {unreadIds.length > 0 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 border-slate-200"
            disabled={markReadMutation.isPending}
            onClick={() => markReadMutation.mutate(unreadIds)}
          >
            <Check className="h-4 w-4 mr-2 text-emerald-600" />
            Mark all read
          </Button>
        ) : null}
      </div>

      <Card className="border-slate-200/80 shadow-sm">
        <CardHeader className="border-b border-slate-100 bg-slate-50/50 pb-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white">
              <Bell className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-lg">Activity</CardTitle>
              <p className="text-xs font-normal text-slate-500 mt-0.5">Latest first · reference and people at a glance</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="py-16 text-center text-slate-500">Loading notifications…</div>
          ) : !notifications.length ? (
            <div className="py-16 text-center text-slate-500">
              <Bell className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium text-slate-700">No notifications yet</p>
              <p className="text-sm mt-1">When something changes on your enquiries, it will show up here.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {notifications.map((n) => {
                const st = notificationCardStyles(n.type);
                const Icon = TYPE_ICONS[n.type] ?? Bell;
                return (
                  <li
                    key={n.id}
                    className={[
                      "rounded-2xl border p-4 transition-shadow",
                      st.shell,
                      n.read ? "opacity-90" : "shadow-md",
                    ].join(" ")}
                  >
                    <div className="flex gap-4">
                      <div
                        className={[
                          "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                          st.iconWrap,
                        ].join(" ")}
                      >
                        <Icon className="h-5 w-5" aria-hidden />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="space-y-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`h-1.5 w-1.5 shrink-0 rounded-full ${st.dot} ${!n.read ? "ring-2 ring-white ring-offset-2" : ""}`}
                                aria-hidden
                              />
                              <span className="font-mono text-sm font-semibold tracking-tight text-slate-900">
                                {n.enquiryNumberDisplay}
                              </span>
                              <Badge
                                variant="secondary"
                                className="rounded-full border-0 bg-white/80 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-700 shadow-sm"
                              >
                                {n.label}
                              </Badge>
                            </div>
                            <p className="text-sm text-slate-700 leading-relaxed">{n.summary}</p>
                            {n.actor ? (
                              <p className="text-sm text-slate-600">
                                <span className="text-slate-400">By </span>
                                <span className="inline-block rounded-md bg-indigo-50 px-2 py-0.5 font-semibold text-indigo-950 ring-1 ring-indigo-200/70">
                                  {n.actor.name}
                                </span>
                                <span className="text-slate-400"> · </span>
                                <span className="text-slate-500">{n.actor.email}</span>
                              </p>
                            ) : null}
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-2 sm:ml-4">
                            {!n.read ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 text-xs font-medium text-slate-600 hover:bg-white/80 hover:text-slate-900"
                                onClick={() => markReadMutation.mutate([n.id])}
                                disabled={markReadMutation.isPending}
                              >
                                <Check className="h-3.5 w-3.5 mr-1.5" />
                                Mark read
                              </Button>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100/90 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                                <Check className="h-3 w-3" />
                                Read
                              </span>
                            )}
                            <time
                              dateTime={n.createdAt}
                              className="text-right text-xs font-medium tabular-nums text-slate-500"
                            >
                              {formatWhen(n.createdAt)}
                            </time>
                          </div>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
