"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export function LogoutButton() {
  const router = useRouter();
  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    router.push("/login");
    router.refresh();
  }
  return (
    <Button type="button" variant="ghost" size="sm" className="w-full justify-start gap-3" onClick={handleLogout}>
      <LogOut className="h-4 w-4" />
      Sign out
    </Button>
  );
}
