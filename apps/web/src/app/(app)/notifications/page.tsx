"use client";

import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";
import { api, fmtDateTime } from "@/lib/format";
import { EmptyState, PageHeader, Panel, PanelSkeleton } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import type { Notice } from "@/components/notification-bell";
import { cn } from "@/lib/utils";

export default function NotificationsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["notifications", "all"], queryFn: () => api<{ notifications: Notice[]; unreadCount: number }>("/api/notifications?limit=100") });

  async function markAll() {
    await api("/api/notifications", { method: "PATCH", json: { all: true } });
    await qc.invalidateQueries({ queryKey: ["notifications"] });
  }
  async function open(n: Notice) {
    if (!n.read) {
      await api("/api/notifications", { method: "PATCH", json: { ids: [n.id] } });
      void qc.invalidateQueries({ queryKey: ["notifications"] });
    }
    if (n.link) router.push(n.link);
  }

  return (
    <>
      <PageHeader title="Notifications" description={data?.unreadCount ? `${data.unreadCount} unread` : "You're all caught up."}>
        {data?.unreadCount ? <Button variant="outline" onClick={() => void markAll()}><CheckCheck className="h-4 w-4" />Mark all read</Button> : null}
      </PageHeader>
      <Panel>
        {isLoading ? <PanelSkeleton className="m-4 h-48" /> : !data?.notifications.length ? (
          <EmptyState icon={Bell} title="No notifications yet" description="You'll hear about new enquiries, pricing, feedback and access decisions here." />
        ) : (
          <ul>
            {data.notifications.map((n) => (
              <li key={n.id} className="border-t border-[var(--app-line-soft)] first:border-0">
                <button onClick={() => void open(n)} className={cn("flex w-full gap-3 px-5 py-4 text-left hover:bg-[var(--app-surface-sunk)]", !n.read && "bg-[var(--app-brand-tint)]/40")}>
                  <span className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", n.read ? "bg-[var(--app-line)]" : "bg-[var(--app-brand)]")} />
                  <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-[var(--app-ink)]">{n.title}</span><span className="block text-sm text-[var(--app-ink-2)]">{n.body}</span></span>
                  <span className="shrink-0 text-xs text-[var(--app-ink-3)]">{fmtDateTime(n.createdAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
