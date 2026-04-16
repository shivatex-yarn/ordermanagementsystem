"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  KeyRound,
  Settings,
  LogOut,
  Users,
  UserPlus,
  FileText,
  Home,
  Menu,
  X,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const adminNav = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/activity", label: "Activity Logs", icon: FileText },
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
  /** Avoid hydration mismatch: auth/session can differ between SSR and client. */
  const [mounted, setMounted] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (isLoading || !mounted) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (user.role !== "SUPER_ADMIN" && user.role !== "MANAGING_DIRECTOR") {
      router.replace("/dashboard");
    }
  }, [mounted, isLoading, user, router]);

  if (!mounted || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="animate-pulse text-slate-500">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="animate-pulse text-slate-500">Loading...</div>
      </div>
    );
  }

  if (user.role !== "SUPER_ADMIN" && user.role !== "MANAGING_DIRECTOR") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="animate-pulse text-slate-500">Loading...</div>
      </div>
    );
  }
  const isViewOnly = user.role === "MANAGING_DIRECTOR";

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-slate-50 md:flex-row">
      {sidebarOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-[1px] md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-70 max-w-[85vw] flex-col border-r border-slate-200 bg-white shadow-[1px_0_0_0_rgba(15,23,42,0.06)] transition-transform duration-200 ease-out md:static md:z-auto md:max-w-none md:w-68 md:shrink-0 md:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-2 border-b border-slate-100 px-4 pb-4 pt-5 md:border-b-0 md:px-5 md:pb-5 md:pt-6">
          <div className="min-w-0 flex-1 space-y-4">
            <Link
              href="/admin/dashboard"
              onClick={() => setSidebarOpen(false)}
              className="group block rounded-xl outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-indigo-500/30"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-slate-400">
                    Console
                  </p>
                  <p className="mt-1 text-base font-semibold leading-snug tracking-tight text-slate-900 group-hover:text-slate-700">
                    Enquiry Management
                  </p>
                </div>
                <span className="shrink-0 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-slate-600">
                  Admin
                </span>
              </div>
            </Link>
            {isViewOnly && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
                View only · Managing Director
              </p>
            )}
            <Button
              asChild
              variant="ghost"
              className="h-10 w-full justify-center gap-2 rounded-lg border border-slate-200 bg-white font-medium text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
            >
              <Link href="/dashboard" onClick={() => setSidebarOpen(false)}>
                <Home className="h-4 w-4 shrink-0 text-slate-600" />
                Main dashboard
              </Link>
            </Button>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 md:hidden"
            aria-label="Close navigation"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-5 w-5 text-slate-600" />
          </Button>
        </div>

        <div className="mx-4 hidden h-px shrink-0 bg-linear-to-r from-transparent via-slate-200 to-transparent md:mx-5 md:block" />

        <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
          <p className="mb-1 px-3 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-slate-400">
            Navigation
          </p>
          {adminNav.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
                  active
                    ? "bg-slate-100 text-slate-900 shadow-[inset_3px_0_0_0_rgb(79,70,229)] ring-1 ring-slate-200/80"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                )}
              >
                <Icon
                  className={cn(
                    "h-4.5 w-4.5 shrink-0 transition-opacity",
                    active ? "text-indigo-600" : "text-slate-500 group-hover:text-slate-700"
                  )}
                  strokeWidth={active ? 2.25 : 2}
                />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto shrink-0 border-t border-slate-200 bg-white p-3">
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-red-50 hover:text-red-700"
          >
            <LogOut className="h-4.5 w-4.5 shrink-0 text-slate-500" />
            Sign out
          </button>
        </div>
      </aside>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-3 sm:px-4 md:hidden">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9 shrink-0"
            aria-label="Open navigation"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">Admin console</p>
            <p className="truncate text-xs text-slate-500">Enquiry Management</p>
          </div>
        </header>
        <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto bg-slate-50 p-4 sm:p-6 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
