"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";

export default function AuditPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (user && (user.role === "SUPER_ADMIN" || user.role === "MANAGING_DIRECTOR")) {
      router.replace("/admin/activity");
      return;
    }
    router.replace("/dashboard");
  }, [isLoading, router, user]);

  return (
    <div className="py-10 text-center text-sm text-slate-500">Redirecting to admin activity logs...</div>
  );
}
