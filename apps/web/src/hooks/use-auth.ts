"use client";

import { useQuery } from "@tanstack/react-query";

export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  divisionId: number | null;
  division?: { id: number; name: string } | null;
}

class HttpError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function safeReadJson(res: Response): Promise<Record<string, unknown>> {
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return {};
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function fetchMe(): Promise<{ user: User }> {
  const res = await fetch("/api/auth/me", { credentials: "include" });
  const data = await safeReadJson(res);
  if (!res.ok) {
    const message =
      typeof data.error === "string" && data.error.trim()
        ? data.error
        : res.status === 401
          ? "Unauthorized"
          : "Request failed";
    const code = typeof data.code === "string" ? data.code : undefined;
    throw new HttpError(message, res.status, code);
  }
  return data as { user: User };
}

export function useAuth() {
  const q = useQuery({
    queryKey: ["auth", "me"],
    queryFn: fetchMe,
    retry: (failureCount, err) => {
      const e = err as unknown as Partial<HttpError>;
      const status = typeof e.status === "number" ? e.status : 0;
      // Don't retry auth/user-not-found style failures.
      if ([401, 403, 404].includes(status)) return false;
      // Retry transient server/db issues a couple times.
      if ([500, 502, 503, 504].includes(status)) return failureCount < 2;
      return false;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 4000),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    // Relative `/api/...` URLs throw in Node during SSR (`Failed to parse URL`). Only fetch in the browser.
    enabled: typeof window !== "undefined",
  });
  return {
    user: q.data?.user ?? null,
    isLoading: q.isLoading,
    isError: q.isError,
    refetch: q.refetch,
  };
}
