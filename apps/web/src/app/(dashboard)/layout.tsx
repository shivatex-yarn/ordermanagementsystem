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
    if ("managerOnly" in item && item.managerOnly && user.role !== "MANAGER" && user.role !== "DIVISION_HEAD") return false;
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
          className="fixed inset-0 z-30 bg-slate-900/50 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 max-w-[85vw] flex-col border-r border-slate-200/80 bg-white shadow-xl transition-transform duration-200 ease-out md:static md:z-auto md:max-w-none md:translate-x-0 md:shadow-none",
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        {/* Sidebar brand header */}
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-gradient-to-r from-indigo-600 to-violet-600 p-4 md:p-5">
          <Link
            href={user.role === "MANAGING_DIRECTOR" ? "/md" : "/dashboard"}
            className="flex min-w-0 items-center gap-2.5"
            onClick={() => setSidebarOpen(false)}
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/20 text-white backdrop-blur-sm">
              <Package className="h-5 w-5" />
            </div>
            <span className="min-w-0 truncate text-base font-bold tracking-tight text-white">
              EnquiryMS
            </span>
          </Link>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-white/80 hover:bg-white/20 hover:text-white md:hidden"
            aria-label="Close navigation"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          {filteredNav.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150",
                  isActive
                    ? "bg-indigo-50 text-indigo-700 shadow-sm ring-1 ring-indigo-100"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                )}
              >
                <Icon className={cn("h-5 w-5 shrink-0", isActive ? "text-indigo-600" : "text-slate-400")} />
                <span className="min-w-0">{item.label}</span>
                {isActive && (
                  <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" aria-hidden />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Sidebar user footer */}
        <div className="border-t border-slate-100 p-3">
          <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-xs font-bold text-indigo-700">
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

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-2 border-b border-slate-200/70 bg-white/95 px-3 shadow-sm backdrop-blur-md sm:gap-3 sm:px-4 md:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 text-slate-600 hover:bg-slate-100 md:hidden"
              aria-label="Open navigation"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-sm font-semibold leading-tight text-slate-900 sm:text-base">
                Welcome back, <span className="text-indigo-600">{user.name}</span>
              </h2>
              <p className="line-clamp-1 text-xs text-slate-500">
                {!showUnreadUi ? (
                  <span className="inline-block h-3 w-44 max-w-full animate-pulse rounded bg-slate-200" aria-hidden />
                ) : unreadCount > 0 ? (
                  <span className="text-amber-600 font-medium">
                    {unreadCount} unread notification{unreadCount === 1 ? "" : "s"}
                  </span>
                ) : (
                  "You’re all caught up."
                )}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/notifications"
              className="relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
              aria-label={
                showUnreadUi && unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"
              }
            >
              <Bell className="h-5 w-5" />
              {showUnreadUi && unreadCount > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              ) : null}
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-xs font-bold text-indigo-700 transition-colors hover:bg-indigo-200"
                  aria-label="Account menu"
                >
                  {userInitials}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 shadow-lg">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-semibold text-slate-900">{user.name}</p>
                    <p className="text-xs text-slate-500">{user.email}</p>
                    <span className="mt-1 inline-flex w-fit rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-700">
                      {user.role.replace(/_/g, " ")}
                    </span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link
                    href="/notifications"
                    className="flex w-full cursor-pointer items-center justify-between gap-2"
                  >
                    <span>Notifications</span>
                    {showUnreadUi && unreadCount > 0 ? (
                      <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
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
