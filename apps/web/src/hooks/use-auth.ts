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

async function fetchMe(): Promise<{ user: User }> {
  const res = await fetch("/api/auth/me", { credentials: "include" });
  if (!res.ok) throw new Error("Unauthorized");
  return res.json();
}

export function useAuth() {
  const q = useQuery({ queryKey: ["auth", "me"], queryFn: fetchMe, retry: false });
  return {
    user: q.data?.user ?? null,
    isLoading: q.isLoading,
    isError: q.isError,
    refetch: q.refetch,
  };
}
