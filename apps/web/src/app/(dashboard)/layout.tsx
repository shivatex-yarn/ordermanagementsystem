"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Package,
  Bell,
  AlertTriangle,
  KeyRound,
  LineChart,
  Users,
  ChevronDown,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { performLogout } from "@/components/logout-button";
import { useAuth } from "@/hooks/use-auth";
import { SLAGate } from "@/components/sla-gate";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/orders", label: "Enquiries", icon: Package },
  { href: "/accounts", label: "Accounts", icon: LineChart, accountsOnly: true },
  { href: "/sla", label: "SLA & Breaches", icon: AlertTriangle },
  { href: "/md", label: "Executive overview", icon: LineChart, mdOverviewOnly: true },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/multi-division-access", label: "Multi-division access", icon: Users, managerOnly: true },
  { href: "/admin", label: "Admin Panel", icon: KeyRound, superAdminOnly: true },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isLoading } = useAuth();
  /** Avoid hydration mismatch: unread counts differ between SSR and client. */
  const [mounted, setMounted] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  const { data: unreadData } = useQuery({
    queryKey: ["notifications-unread-count"],
    queryFn: async () => {
      const res = await fetch("/api/notifications?countOnly=true", { credentials: "include" });
      if (!res.ok) return { unreadCount: 0 };
      return res.json() as Promise<{ unreadCount: number }>;
    },
    enabled: !!user,
    refetchInterval: 60_000,
  });
  const unreadCount = unreadData?.unreadCount ?? 0;
  /** Avoid hydration mismatch for notification copy/badge until client mount. */
  const showUnreadUi = mounted;

  /**
   * `useAuth()` intentionally does not fetch during SSR (relative `/api/...` URL),
   * so the server-rendered HTML can differ from the first client render.
   * Render a stable loading shell until we mount to avoid hydration mismatch.
   */
  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="animate-pulse text-slate-500">Loading...</div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="animate-pulse text-slate-500">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <p className="text-slate-600 mb-4">Please sign in.</p>
          <Button asChild>
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </div>
    );
  }

  const isAccountsView = user.role === "ACCOUNTS";

  const filteredNav = nav.filter((item) => {
    if (isAccountsView) {
      // Accounts users: their dedicated dashboard + enquiry list + notifications.
      return (
        item.href === "/accounts" ||
        item.href === "/orders" ||
        item.href === "/notifications"
      );
    }
    if (user.role === "MANAGING_DIRECTOR") {
      // MD lands on /md but should also be able to reach /accounts for commercial rollup.
      return item.href === "/md" || item.href === "/accounts" || item.href === "/notifications";
    }
    if ("accountsOnly" in item && item.accountsOnly && user.role !== "ACCOUNTS" && user.role !== "SUPER_ADMIN" && user.role !== "MANAGING_DIRECTOR") return false;
    if ("managerOnly" in item && item.managerOnly && !["MANAGER", "DIVISION_HEAD", "USER", "SUPERVISOR", "ASM"].includes(user.role)) return false;
    if ("superAdminOnly" in item && item.superAdminOnly && user.role !== "SUPER_ADMIN" && user.role !== "MANAGING_DIRECTOR") {
      return false;
    }
    if ("mdOverviewOnly" in item && item.mdOverviewOnly && user.role !== "SUPER_ADMIN" && user.role !== "MANAGING_DIRECTOR") {
      return false;
    }
    if (item.href === "/sla" && !["SUPER_ADMIN", "MANAGING_DIRECTOR"].includes(user.role)) return false;
    return true;
  });

  const userInitials = user.name
    ? user.name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)
    : "U";

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-slate-50 md:flex-row">
      {sidebarOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-black/30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 max-w-[85vw] flex-col border-r border-slate-200 bg-white transition-transform duration-200 ease-out md:static md:z-auto md:max-w-none md:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        {/* Brand */}
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-5 py-4">
          <Link
            href={user.role === "MANAGING_DIRECTOR" ? "/md" : "/dashboard"}
            className="flex min-w-0 items-center gap-2.5"
            onClick={() => setSidebarOpen(false)}
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-900">
              <Package className="h-4 w-4 text-white" />
            </div>
            <span className="min-w-0 truncate text-sm font-bold tracking-tight text-slate-900">
              EnquiryMS
            </span>
          </Link>
          <button
            type="button"
            aria-label="Close navigation"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 md:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-px overflow-y-auto p-3">
          {filteredNav.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1">{item.label}</span>
                {isActive && (
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-white/60" aria-hidden />
                )}
              </Link>
            );
          })}
        </nav>

        {/* User footer */}
        <div className="border-t border-slate-200 p-3">
          <div className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-900 text-[11px] font-bold text-white">
              {userInitials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-slate-800">{user.name}</p>
              <p className="truncate text-[10px] uppercase tracking-wide text-slate-400">
                {user.role.replace(/_/g, " ")}
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 md:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <button
              type="button"
              aria-label="Open navigation"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 md:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-sm font-semibold text-slate-900">
                Welcome back, {user.name}
              </h2>
              <p className="truncate text-xs text-slate-500">
                {!showUnreadUi ? (
                  <span className="inline-block h-3 w-40 animate-pulse rounded bg-slate-200" aria-hidden />
                ) : unreadCount > 0 ? (
                  `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`
                ) : (
                  "You’re all caught up."
                )}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/notifications"
              className="relative flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50"
              aria-label={showUnreadUi && unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
            >
              <Bell className="h-4 w-4" />
              {showUnreadUi && unreadCount > 0 ? (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-slate-900 px-1 text-[9px] font-bold text-white">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              ) : null}
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-900 text-[11px] font-bold text-white transition-colors hover:bg-slate-700"
                  aria-label="Account menu"
                >
                  {userInitials}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 shadow-lg">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col gap-0.5">
                    <p className="text-sm font-semibold text-slate-900">{user.name}</p>
                    <p className="text-xs text-slate-500">{user.email}</p>
                    <span className="mt-1 inline-flex w-fit rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                      {user.role.replace(/_/g, " ")}
                    </span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/notifications" className="flex w-full cursor-pointer items-center justify-between gap-2">
                    <span>Notifications</span>
                    {showUnreadUi && unreadCount > 0 ? (
                      <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                    ) : null}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="cursor-pointer text-red-600 focus:text-red-600"
                  onClick={() => void performLogout(router, queryClient)}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="flex-1 overflow-x-hidden overflow-y-auto p-4 sm:p-6 md:p-8">{children}</main>
      </div>
      <SLAGate />
    </div>
  );
}
