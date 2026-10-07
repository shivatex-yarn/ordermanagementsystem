"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  LogOut,
  Menu,
  Search,
  X,
} from "lucide-react";
import { performLogout } from "@/components/logout-button";
import { useAuth } from "@/hooks/use-auth";
import { useIdleLogout } from "@/hooks/use-idle-logout";
import { IdleWarningDialog } from "@/components/idle-warning-dialog";
import { SLAGate } from "@/components/sla-gate";
import { roleLabel } from "@/lib/roles";
import Image from "next/image";
import { APP_NAME, APP_VERSION, COMPANY_LOGO, COMPANY_NAME } from "@/lib/branding";
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

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  group: "work" | "oversight" | "manage";
  accountsOnly?: boolean;
  managerOnly?: boolean;
  superAdminOnly?: boolean;
  mdOverviewOnly?: boolean;
};

const nav: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, group: "work" },
  { href: "/orders", label: "Enquiries", icon: Package, group: "work" },
  { href: "/notifications", label: "Notifications", icon: Bell, group: "work" },
  { href: "/accounts", label: "Accounts", icon: LineChart, group: "oversight", accountsOnly: true },
  { href: "/sla", label: "SLA & breaches", icon: AlertTriangle, group: "oversight" },
  { href: "/md", label: "Executive overview", icon: LineChart, group: "oversight", mdOverviewOnly: true },
  { href: "/multi-division-access", label: "Multi-division access", icon: Users, group: "manage", managerOnly: true },
  { href: "/admin", label: "Admin panel", icon: KeyRound, group: "manage", superAdminOnly: true },
];

const GROUP_LABEL: Record<NavItem["group"], string> = {
  work: "My work",
  oversight: "Oversight",
  manage: "Manage",
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isLoading } = useAuth();
  /** Avoid hydration mismatch: unread counts differ between SSR and client. */
  const [mounted, setMounted] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [search, setSearch] = useState("");
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

  const handleIdleLogout = useCallback(async () => {
    await performLogout(router, queryClient);
  }, [router, queryClient]);

  const { secondsLeft, stayLoggedIn } = useIdleLogout({
    onLogout: handleIdleLogout,
    enabled: mounted && !!user,
  });

  const role = user?.role ?? "";

  const filteredNav = useMemo(() => {
    if (!role) return [];
    return nav.filter((item) => {
      if (role === "ACCOUNTS") {
        // Accounts users: their dedicated dashboard + enquiry list + notifications.
        return item.href === "/accounts" || item.href === "/orders" || item.href === "/notifications";
      }
      if (role === "MANAGING_DIRECTOR") {
        // MD lands on /md but should also be able to reach /accounts for commercial rollup.
        return item.href === "/md" || item.href === "/accounts" || item.href === "/notifications";
      }
      if (item.accountsOnly && !["ACCOUNTS", "SUPER_ADMIN", "MANAGING_DIRECTOR"].includes(role)) return false;
      if (item.managerOnly && !["MANAGER", "DIVISION_HEAD", "USER", "SUPERVISOR", "ASM"].includes(role)) return false;
      if (item.superAdminOnly && !["SUPER_ADMIN", "MANAGING_DIRECTOR"].includes(role)) return false;
      if (item.mdOverviewOnly && !["SUPER_ADMIN", "MANAGING_DIRECTOR"].includes(role)) return false;
      if (item.href === "/sla" && !["SUPER_ADMIN", "MANAGING_DIRECTOR"].includes(role)) return false;
      return true;
    });
  }, [role]);

  /**
   * `useAuth()` intentionally does not fetch during SSR (relative `/api/...` URL),
   * so the server-rendered HTML can differ from the first client render.
   * Render a stable loading shell until we mount to avoid hydration mismatch.
   */
  if (!mounted || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--app-plane)]">
        <div className="flex flex-col items-center gap-3">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--app-line)] border-t-[var(--app-brand)]" />
          <p className="text-sm text-[var(--app-ink-3)]">Loading your workspace…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--app-plane)]">
        <div className="text-center">
          <p className="mb-4 text-[var(--app-ink-2)]">Please sign in.</p>
          <Button asChild>
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </div>
    );
  }

  const userInitials = user.name
    ? user.name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)
    : "U";

  const homeHref =
    user.role === "MANAGING_DIRECTOR" ? "/md" : user.role === "ACCOUNTS" ? "/accounts" : "/dashboard";

  const groups: NavItem["group"][] = ["work", "oversight", "manage"];

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const term = search.trim();
    router.push(term ? `/orders?q=${encodeURIComponent(term)}` : "/orders");
  }

  return (
    /* h-screen + overflow-hidden so the content column scrolls on its own and
       the sidebar stays full height however long the page gets. */
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--app-plane)] md:flex-row">
      {sidebarOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[264px] max-w-[85vw] flex-col bg-[var(--app-nav)] transition-transform duration-200 ease-out md:static md:z-auto md:max-w-none md:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        {/* Brand */}
        <div className="flex items-center justify-between gap-2 px-5 py-5">
          <Link href={homeHref} className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white p-1">
              <Image
                src={COMPANY_LOGO}
                alt=""
                width={32}
                height={32}
                className="h-full w-full object-contain"
              />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-extrabold leading-tight tracking-tight text-white">
                {COMPANY_NAME}
              </span>
              <span className="block truncate text-[10px] leading-tight text-[var(--app-nav-ink)]">
                {APP_NAME}
              </span>
            </span>
          </Link>
          <button
            type="button"
            aria-label="Close navigation"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--app-nav-ink)] hover:bg-[var(--app-nav-2)] md:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="scroll-soft flex-1 overflow-y-auto px-3 pb-3">
          {groups.map((group) => {
            const items = filteredNav.filter((i) => i.group === group);
            if (items.length === 0) return null;
            return (
              <div key={group} className="mb-5">
                <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--app-nav-ink)]/70">
                  {GROUP_LABEL[group]}
                </p>
                <ul className="space-y-0.5">
                  {items.map((item) => {
                    const Icon = item.icon;
                    const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={() => setSidebarOpen(false)}
                          aria-current={isActive ? "page" : undefined}
                          className={cn(
                            "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
                            isActive
                              ? "bg-[var(--app-brand)] text-white"
                              : "text-[var(--app-nav-ink)] hover:bg-[var(--app-nav-2)] hover:text-white"
                          )}
                        >
                          <Icon className="h-4 w-4 shrink-0" aria-hidden />
                          <span className="min-w-0 flex-1 truncate">{item.label}</span>
                          {item.href === "/notifications" && showUnreadUi && unreadCount > 0 ? (
                            <span
                              className={cn(
                                "flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-bold",
                                isActive ? "bg-white text-[var(--app-brand)]" : "bg-[var(--app-brand)] text-white"
                              )}
                            >
                              {unreadCount > 99 ? "99+" : unreadCount}
                            </span>
                          ) : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>

        {/* Signed-in person */}
        <div className="border-t border-[var(--app-nav-line)] p-3">
          <div className="flex items-center gap-3 rounded-xl px-2 py-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--app-nav-2)] text-[11px] font-bold text-white">
              {userInitials}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-bold text-white">{user.name}</span>
              <span className="block truncate text-[10px] uppercase tracking-wide text-[var(--app-nav-ink)]">
                {roleLabel(user.role as Parameters<typeof roleLabel>[0])}
              </span>
            </span>
            <button
              type="button"
              aria-label="Log out"
              onClick={() => void performLogout(router, queryClient)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--app-nav-ink)] hover:bg-[var(--app-nav-2)] hover:text-white"
            >
              <LogOut className="h-4 w-4" aria-hidden />
            </button>
          </div>
          <p className="px-2 pt-2 text-[10px] font-semibold tracking-wide text-[var(--app-nav-ink)]/60">
            Version {APP_VERSION}
          </p>
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────────────── */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b border-[var(--app-line)] bg-[var(--app-surface)] px-4 md:px-7">
          <button
            type="button"
            aria-label="Open navigation"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--app-line)] text-[var(--app-ink-2)] hover:bg-[var(--app-surface-sunk)] md:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-4 w-4" />
          </button>

          <form onSubmit={submitSearch} className="relative hidden min-w-0 flex-1 md:block" role="search">
            <label htmlFor="global-search" className="sr-only">
              Search enquiries
            </label>
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--app-ink-3)]"
              aria-hidden
            />
            <input
              id="global-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by enquiry number, company or customer…"
              className="h-10 w-full max-w-md rounded-xl border border-[var(--app-line)] bg-[var(--app-surface-sunk)] pl-10 pr-4 text-sm text-[var(--app-ink)] placeholder:text-[var(--app-ink-3)] focus:border-[var(--app-brand-line)] focus:bg-white focus:outline-none"
            />
          </form>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Link
              href="/notifications"
              className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--app-line)] text-[var(--app-ink-2)] hover:bg-[var(--app-surface-sunk)]"
              aria-label={
                showUnreadUi && unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"
              }
            >
              <Bell className="h-4 w-4" aria-hidden />
              {showUnreadUi && unreadCount > 0 ? (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--app-late-ink)] px-1 text-[9px] font-bold text-white">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              ) : null}
            </Link>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex h-9 items-center gap-2 rounded-lg border border-[var(--app-line)] pl-1 pr-2.5 hover:bg-[var(--app-surface-sunk)]"
                  aria-label="Account menu"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--app-brand)] text-[10px] font-bold text-white">
                    {userInitials}
                  </span>
                  <span className="hidden max-w-[10rem] truncate text-xs font-semibold text-[var(--app-ink)] sm:block">
                    {user.name}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60 shadow-lg">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col gap-0.5">
                    <p className="text-sm font-semibold text-[var(--app-ink)]">{user.name}</p>
                    <p className="text-xs text-[var(--app-ink-3)]">{user.email}</p>
                    <span className="mt-1 inline-flex w-fit rounded bg-[var(--app-brand-tint)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--app-brand)]">
                      {roleLabel(user.role as Parameters<typeof roleLabel>[0])}
                    </span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/notifications" className="flex w-full cursor-pointer items-center justify-between gap-2">
                    <span>Notifications</span>
                    {showUnreadUi && unreadCount > 0 ? (
                      <span className="shrink-0 rounded bg-[var(--app-surface-sunk)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--app-ink-2)]">
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

        <main className="flex-1 overflow-x-hidden overflow-y-auto p-4 sm:p-6 md:p-7">{children}</main>
      </div>

      <SLAGate />
      <IdleWarningDialog
        secondsLeft={secondsLeft}
        onStayLoggedIn={stayLoggedIn}
        onLogoutNow={() => void handleIdleLogout()}
      />
    </div>
  );
}
