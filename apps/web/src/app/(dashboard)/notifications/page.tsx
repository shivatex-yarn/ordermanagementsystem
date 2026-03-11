"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

async function fetchNotifications() {
  const res = await fetch("/api/notifications?limit=50", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch notifications");
  return res.json();
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const notifications = data?.notifications ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
      <Card>
        <CardHeader>
          <CardTitle>All notifications</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-slate-500">Loading...</div>
          ) : !notifications.length ? (
            <div className="py-8 text-center text-slate-500">No notifications.</div>
          ) : (
            <ul className="space-y-2">
              {notifications.map((n: { id: number; type: string; title: string; body: string; read: boolean; createdAt: string }) => (
                <li
                  key={n.id}
                  className={`rounded-lg border p-4 ${n.read ? "border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50" : "border-slate-300 dark:border-slate-700"}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium">{n.title}</p>
                      <p className="text-sm text-slate-500 mt-1">{new Date(n.createdAt).toLocaleString()}</p>
                    </div>
                    {!n.read && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => markReadMutation.mutate([n.id])}
                        disabled={markReadMutation.isPending}
                      >
                        Mark read
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
