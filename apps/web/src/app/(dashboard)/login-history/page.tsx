"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { History, Monitor, ChevronLeft, ChevronRight } from "lucide-react";

type SessionRow = {
  id: number;
  sessionId: string;
  loggedInAt: string;
  loggedOutAt: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  isCurrentSession: boolean;
};

type LoginHistoryResponse = {
  sessions: SessionRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h ${m % 60}m`;
  if (h > 0) return `${h}h ${m % 60}m ${s % 60}s`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function shortUserAgent(ua: string | null): string {
  if (!ua?.trim()) return "—";
  const u = ua.trim();
  if (u.length <= 72) return u;
  return `${u.slice(0, 69)}…`;
}

async function fetchHistory(page: number): Promise<LoginHistoryResponse> {
  const res = await fetch(`/api/auth/login-history?page=${page}`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load login history");
  return res.json();
}

function SessionDuration({
  loggedInAt,
  loggedOutAt,
  isActive,
}: {
  loggedInAt: string;
  loggedOutAt: string | null;
  isActive: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!isActive || loggedOutAt) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [isActive, loggedOutAt]);

  const start = new Date(loggedInAt).getTime();
  const end = loggedOutAt ? new Date(loggedOutAt).getTime() : now;
  return <span className="tabular-nums">{formatDurationMs(end - start)}</span>;
}

export default function LoginHistoryPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["login-history", page],
    queryFn: () => fetchHistory(page),
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Login history</h1>
        <p className="mt-1 text-sm text-slate-600">
          Sign-in times, how long each session lasted, device and network details for your account.
        </p>
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-slate-600" />
            <div>
              <CardTitle className="text-lg">Sessions</CardTitle>
              <CardDescription>
                Each row is a browser sign-in. “Active” means you have not signed out from that session (or the
                server did not record sign-out yet).
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          {isLoading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : isError ? (
            <p className="text-sm text-red-600">Could not load login history.</p>
          ) : !data?.sessions.length ? (
            <p className="text-sm text-slate-500">No sign-in history yet. History is recorded when you sign in.</p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2.5">Signed in</th>
                      <th className="px-3 py-2.5">Signed out</th>
                      <th className="px-3 py-2.5">Duration</th>
                      <th className="px-3 py-2.5">IP address</th>
                      <th className="px-3 py-2.5">Device / browser</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.sessions.map((s) => {
                      const isActive = !s.loggedOutAt;
                      return (
                        <tr key={s.id} className="bg-white hover:bg-slate-50/50">
                          <td className="px-3 py-3 align-top text-slate-800">
                            <div className="flex flex-col gap-1">
                              <span>{formatDateTime(s.loggedInAt)}</span>
                              {s.isCurrentSession ? (
                                <Badge variant="secondary" className="w-fit text-[10px]">
                                  This device
                                </Badge>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-3 py-3 align-top text-slate-700">
                            {s.loggedOutAt ? (
                              formatDateTime(s.loggedOutAt)
                            ) : (
                              <Badge className="bg-emerald-600 hover:bg-emerald-600">Active</Badge>
                            )}
                          </td>
                          <td className="px-3 py-3 align-top text-slate-800">
                            <SessionDuration
                              loggedInAt={s.loggedInAt}
                              loggedOutAt={s.loggedOutAt}
                              isActive={isActive}
                            />
                          </td>
                          <td className="px-3 py-3 align-top font-mono text-xs text-slate-600">
                            {s.ipAddress ?? "—"}
                          </td>
                          <td className="px-3 py-3 align-top text-slate-700">
                            <div className="flex gap-2">
                              <Monitor className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                              <span className="break-all text-xs leading-relaxed">{shortUserAgent(s.userAgent)}</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {data.totalPages > 1 ? (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-slate-500">
                    Showing {(data.page - 1) * data.pageSize + 1}–
                    {Math.min(data.page * data.pageSize, data.total)} of {data.total}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={data.page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <span className="text-xs text-slate-600">
                      Page {data.page} / {data.totalPages}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={data.page >= data.totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
