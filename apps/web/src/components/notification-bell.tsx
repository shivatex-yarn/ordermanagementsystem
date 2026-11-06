"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { api, fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export type Notice = { id: number; type: string; title: string; body: string; link: string | null; read: boolean; createdAt: string };

/** Bell with an unread count; opens the latest notifications. */
export function NotificationBell() {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: count } = useQuery({
    queryKey: ["notifications", "count"],
    queryFn: () => api<{ unreadCount: number }>("/api/notifications?countOnly=1"),
    refetchInterval: 45_000,
    staleTime: 20_000,
  });
  const { data, refetch } = useQuery({
    queryKey: ["notifications", "latest"],
    queryFn: () => api<{ notifications: Notice[]; unreadCount: number }>("/api/notifications?limit=6"),
    enabled: false,
  });
  const unread = count?.unreadCount ?? 0;

  async function markAll() {
    await api("/api/notifications", { method: "PATCH", json: { all: true } });
    await Promise.all([qc.invalidateQueries({ queryKey: ["notifications"] }), refetch()]);
  }
  async function open(n: Notice) {
    if (!n.read) {
      await api("/api/notifications", { method: "PATCH", json: { ids: [n.id] } });
      void qc.invalidateQueries({ queryKey: ["notifications"] });
    }
    if (n.link) router.push(n.link);
  }

  return (
    <DropdownMenu onOpenChange={(o) => o && void refetch()}>
      <DropdownMenuTrigger asChild>
        <button aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--app-line)] bg-white text-[var(--app-ink-2)] transition-colors hover:bg-[var(--app-surface-sunk)]">
          <Bell className="h-[18px] w-[18px]" aria-hidden />
          {unread > 0 ? (
            <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--app-late-ink)] px-1 text-[10px] font-bold text-white">{unread > 99 ? "99+" : unread}</span>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[22rem] max-w-[92vw] p-0">
        <div className="flex items-center justify-between border-b border-[var(--app-line-soft)] px-4 py-3">
          <p className="text-sm font-bold text-[var(--app-ink)]">Notifications</p>
          {unread > 0 ? <button onClick={() => void markAll()} className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--app-brand)] hover:underline"><CheckCheck className="h-3.5 w-3.5" />Mark all read</button> : null}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {!data ? <p className="px-4 py-6 text-center text-sm text-[var(--app-ink-3)]">Loading…</p>
            : data.notifications.length === 0 ? <p className="px-4 py-8 text-center text-sm text-[var(--app-ink-3)]">You&apos;re all caught up.</p>
            : data.notifications.map((n) => (
              <button key={n.id} onClick={() => void open(n)} className={cn("flex w-full gap-3 border-b border-[var(--app-line-soft)] px-4 py-3 text-left last:border-0 hover:bg-[var(--app-surface-sunk)]", !n.read && "bg-[var(--app-brand-tint)]/50")}>
                <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-[var(--app-brand)]")} />
                <span className="min-w-0"><span className="block text-sm font-semibold text-[var(--app-ink)]">{n.title}</span><span className="line-clamp-2 text-xs text-[var(--app-ink-2)]">{n.body}</span><span className="mt-0.5 block text-[11px] text-[var(--app-ink-3)]">{fmtDateTime(n.createdAt)}</span></span>
              </button>
            ))}
        </div>
        <Link href="/notifications" className="block border-t border-[var(--app-line-soft)] px-4 py-3 text-center text-xs font-semibold text-[var(--app-brand)] hover:bg-[var(--app-surface-sunk)]">View all notifications</Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
