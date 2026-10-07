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
import { cn } from "@/lib/utils";
import Image from "next/image";
import { APP_NAME, APP_VERSION, COMPANY_LOGO, COMPANY_NAME } from "@/lib/branding";

const adminNav = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/activity", label: "Activity logs", icon: FileText },
  { href: "/admin/users", label: "Users", icon: UserPlus },
  { href: "/admin/divisions", label: "Divisions", icon: KeyRound },
  { href: "/admin/multi-division", label: "Multi-division access", icon: Users },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
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

  if (!mounted || isLoading || !user || (user.role !== "SUPER_ADMIN" && user.role !== "MANAGING_DIRECTOR")) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--app-plane)]">
        <div className="flex flex-col items-center gap-3">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--app-line)] border-t-[var(--app-brand)]" />
          <p className="text-sm text-[var(--app-ink-3)]">Checking your access…</p>
        </div>
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
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--app-plane)] md:flex-row">
      {sidebarOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[264px] max-w-[85vw] flex-col bg-[var(--app-nav)] transition-transform duration-200 ease-out md:static md:z-auto md:max-w-none md:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        <div className="flex items-center justify-between gap-2 px-5 py-5">
          <Link href="/admin/dashboard" className="flex min-w-0 items-center gap-3">
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
                {APP_NAME} · Admin console
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

        {isViewOnly ? (
          <p className="mx-3 mb-3 rounded-xl border border-[var(--app-act-line)] bg-[var(--app-act-bg)] px-3 py-2 text-xs font-semibold text-[var(--app-act-ink)]">
            You are signed in as Managing Director — this console is read-only for you.
          </p>
        ) : null}

        <nav className="scroll-soft flex-1 overflow-y-auto px-3 pb-3">
          <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--app-nav-ink)]/70">
            Administration
          </p>
          <ul className="space-y-0.5">
            {adminNav.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
                      active
                        ? "bg-[var(--app-brand)] text-white"
                        : "text-[var(--app-nav-ink)] hover:bg-[var(--app-nav-2)] hover:text-white"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>

          <p className="mt-5 px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--app-nav-ink)]/70">
            Leave the console
          </p>
          <Link
            href="/dashboard"
            onClick={() => setSidebarOpen(false)}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-[var(--app-nav-ink)] hover:bg-[var(--app-nav-2)] hover:text-white"
          >
            <Home className="h-4 w-4 shrink-0" aria-hidden />
            Main dashboard
          </Link>
        </nav>

        <div className="border-t border-[var(--app-nav-line)] p-3">
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-[var(--app-nav-ink)] hover:bg-[var(--app-nav-2)] hover:text-white"
          >
            <LogOut className="h-4 w-4 shrink-0" aria-hidden />
            Sign out
          </button>
          <p className="px-3 pt-2 text-[10px] font-semibold tracking-wide text-[var(--app-nav-ink)]/60">
            Version {APP_VERSION}
          </p>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b border-[var(--app-line)] bg-[var(--app-surface)] px-4 md:hidden">
          <button
            type="button"
            aria-label="Open navigation"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--app-line)] text-[var(--app-ink-2)]"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-[var(--app-ink)]">Admin console</p>
            <p className="truncate text-xs text-[var(--app-ink-3)]">{COMPANY_NAME}</p>
          </div>
        </header>
        <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-4 sm:p-6 md:p-7">{children}</main>
      </div>
    </div>
  );
}
