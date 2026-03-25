"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

type AppRouter = { push: (href: string) => void; refresh: () => void };

export async function performLogout(router: AppRouter) {
  await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
  router.push("/login");
  router.refresh();
}

export function LogoutButton() {
  const router = useRouter();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="w-full justify-start gap-3"
      onClick={() => performLogout(router)}
    >
      <LogOut className="h-4 w-4" />
      Sign out
    </Button>
  );
}
