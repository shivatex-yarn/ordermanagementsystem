"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, KeyRound, Settings, LogOut, Users, UserPlus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

const adminNav = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users", icon: UserPlus },
  { href: "/admin/divisions", label: "Divisions", icon: KeyRound },
  { href: "/admin/multi-division", label: "Multi-division access", icon: Users },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="animate-pulse text-slate-500">Loading...</div>
      </div>
    );
  }

  if (!user) {
    router.replace("/login");
    return null;
  }

  if (user.role !== "SUPER_ADMIN" && user.role !== "MANAGING_DIRECTOR") {
    router.replace("/dashboard");
    return null;
  }
  const isViewOnly = user.role === "MANAGING_DIRECTOR";

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex bg-white">
      <aside className="w-64 border-r border-slate-100 bg-slate-50/80 flex flex-col">
        <div className="p-6 border-b border-slate-100">
          <Link href="/admin/dashboard" className="font-semibold text-lg text-slate-900">
            Enquiry Management — Admin
          </Link>
          {isViewOnly && (
            <p className="text-xs text-slate-500 mt-1">View only (MD)</p>
          )}
        </div>
        <nav className="flex-1 p-3 space-y-0.5">
          {adminNav.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  pathname === item.href
                    ? "bg-white text-slate-900 shadow-sm border border-slate-100"
                    : "text-slate-600 hover:bg-white/60 hover:text-slate-900"
                )}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-slate-100">
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
          >
            <LogOut className="h-5 w-5" />
            Logout
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto p-6 md:p-8 bg-white">{children}</main>
    </div>
  );
}
