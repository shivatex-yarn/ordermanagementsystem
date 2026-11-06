"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { BarChart3, Bell, ClipboardList, Gauge, Globe2, LayoutDashboard, LogOut, Menu, ScrollText, UserCircle, Users, Wallet, X } from "lucide-react";
import { NotificationBell } from "@/components/notification-bell";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { performLogout } from "@/components/logout-button";
import { useAuth } from "@/hooks/use-auth";
import { useIdleLogout } from "@/hooks/use-idle-logout";
import { IdleWarningDialog } from "@/components/idle-warning-dialog";
import { Button } from "@/components/ui/button";
import { roleLabel } from "@/lib/roles";
import { APP_NAME, COMPANY_LOGO, COMPANY_NAME } from "@/lib/branding";
import { cn } from "@/lib/utils";

type Role = "SUPER_ADMIN" | "MANAGING_DIRECTOR" | "ACCOUNTS" | "MARKETING" | "SALES";
type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string }>; roles: Role[] };

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["MARKETING", "SALES"] },
  { href: "/overview", label: "Overview", icon: BarChart3, roles: ["SUPER_ADMIN"] },
  { href: "/md", label: "Executive", icon: Gauge, roles: ["MANAGING_DIRECTOR", "SUPER_ADMIN"] },
  { href: "/accounts", label: "Accounts", icon: Wallet, roles: ["ACCOUNTS", "SUPER_ADMIN"] },
  { href: "/orders", label: "Enquiries", icon: ClipboardList, roles: ["SUPER_ADMIN", "MANAGING_DIRECTOR", "ACCOUNTS", "MARKETING", "SALES"] },
  { href: "/divisions", label: "Divisions", icon: Globe2, roles: ["SUPER_ADMIN", "MARKETING", "SALES"] },
  { href: "/team", label: "Team", icon: Users, roles: ["SUPER_ADMIN"] },
  { href: "/audit", label: "Audit log", icon: ScrollText, roles: ["SUPER_ADMIN"] },
  { href: "/notifications", label: "Notifications", icon: Bell, roles: ["SUPER_ADMIN", "MANAGING_DIRECTOR", "ACCOUNTS", "MARKETING", "SALES"] },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isLoading } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => setOpen(false), [pathname]);

  const logout = useCallback(async () => performLogout(router, queryClient), [router, queryClient]);
  const { secondsLeft, stayLoggedIn } = useIdleLogout({ onLogout: logout, enabled: mounted && !!user });
  const items = useMemo(() => NAV.filter((n) => user && n.roles.includes(user.role)), [user]);

  if (!mounted || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--app-plane)]">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--app-line)] border-t-[var(--app-brand)]" />
      </div>
    );
  }
  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--app-plane)]">
        <p className="text-[var(--app-ink-2)]">Your session ended. Sign in again to continue.</p>
        <Button asChild><Link href="/login">Sign in</Link></Button>
      </div>
    );
  }

  const initials = user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--app-plane)] md:flex-row">
      {open ? <button aria-label="Close menu" className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setOpen(false)} /> : null}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col bg-[var(--app-nav)] transition-transform duration-200 md:static md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between px-5 py-6">
          <Link href={items[0]?.href ?? "/orders"} className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white p-1">
              <Image src={COMPANY_LOGO} alt="" width={36} height={36} className="h-full w-full object-contain" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-extrabold leading-tight text-white">{COMPANY_NAME}</span>
              <span className="block truncate text-[10px] text-[var(--app-nav-ink)]">{APP_NAME}</span>
            </span>
          </Link>
          <button aria-label="Close menu" className="rounded-lg p-1.5 text-[var(--app-nav-ink)] hover:bg-[var(--app-nav-2)] md:hidden" onClick={() => setOpen(false)}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 px-3">
          {items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-colors",
                  active ? "bg-[var(--app-brand)] text-white" : "text-[var(--app-nav-ink)] hover:bg-[var(--app-nav-2)] hover:text-white"
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-[var(--app-nav-line)] p-3">
          <div className="flex items-center gap-3 rounded-xl px-2 py-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--app-nav-2)] text-[11px] font-bold text-white">{initials}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-bold text-white">{user.name}</span>
              <span className="block truncate text-[10px] uppercase tracking-wide text-[var(--app-nav-ink)]">{roleLabel(user.role)}</span>
            </span>
            <button aria-label="Sign out" onClick={() => void logout()} className="rounded-lg p-2 text-[var(--app-nav-ink)] hover:bg-[var(--app-nav-2)] hover:text-white">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-[var(--app-line)] bg-[var(--app-surface)] px-4 sm:px-8">
          <button aria-label="Open menu" className="rounded-lg border border-[var(--app-line)] p-2 text-[var(--app-ink-2)] md:hidden" onClick={() => setOpen(true)}>
            <Menu className="h-4 w-4" />
          </button>
          <span className="truncate text-sm font-bold text-[var(--app-ink)] md:hidden">{COMPANY_NAME}</span>
          <div className="ml-auto flex items-center gap-3">
            <NotificationBell />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button aria-label="Account menu" className="flex items-center gap-2.5 rounded-xl p-1 pr-2 text-left transition-colors hover:bg-[var(--app-surface-sunk)]">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--app-brand)] text-xs font-bold text-white">{initials}</span>
                  <span className="hidden leading-tight sm:block"><span className="block max-w-[11rem] truncate text-sm font-bold text-[var(--app-ink)]">{user.name}</span><span className="block text-[11px] uppercase tracking-wide text-[var(--app-ink-3)]">{roleLabel(user.role)}</span></span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel className="font-normal">
                  <span className="block text-sm font-bold text-[var(--app-ink)]">{user.name}</span>
                  <span className="block truncate text-xs text-[var(--app-ink-3)]">{user.email}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="cursor-pointer gap-2" onClick={() => router.push("/profile")}><UserCircle className="h-4 w-4" />Profile</DropdownMenuItem>
                <DropdownMenuItem className="cursor-pointer gap-2 text-[var(--app-late-ink)] focus:text-[var(--app-late-ink)]" onClick={() => void logout()}><LogOut className="h-4 w-4" />Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-6 sm:px-8 sm:py-8">
          <div className="mx-auto w-full max-w-6xl space-y-6">{children}</div>
        </main>
      </div>

      <IdleWarningDialog secondsLeft={secondsLeft} onStayLoggedIn={stayLoggedIn} onLogoutNow={() => void logout()} />
    </div>
  );
}
