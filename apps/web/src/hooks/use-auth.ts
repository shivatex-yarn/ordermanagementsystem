"use client";

import { useQuery } from "@tanstack/react-query";

export interface User {
  id: number;
  name: string;
  email: string;
  employeeCode: string | null;
  phone: string | null;
  role: "SUPER_ADMIN" | "MANAGING_DIRECTOR" | "ACCOUNTS" | "MARKETING" | "SALES";
  divisions: { id: number; name: string }[];
}

class HttpError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function fetchMe(): Promise<{ user: User }> {
  const res = await fetch("/api/auth/me", { credentials: "include" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new HttpError(typeof data.error === "string" ? data.error : "Request failed", res.status);
  return data as { user: User };
}

export function useAuth() {
  const q = useQuery({
    queryKey: ["auth", "me"],
    queryFn: fetchMe,
    retry: (count, err) => {
      const status = (err as Partial<HttpError>).status ?? 0;
      if ([401, 403, 404].includes(status)) return false;
      return count < 2;
    },
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    enabled: typeof window !== "undefined",
  });
  return { user: q.data?.user ?? null, isLoading: q.isLoading, isError: q.isError, refetch: q.refetch };
}
