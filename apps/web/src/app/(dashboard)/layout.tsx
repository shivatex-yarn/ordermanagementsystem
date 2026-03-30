"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Package,
  Bell,
  AlertTriangle,
  KeyRound,
  LineChart,
  ChevronDown,
  LogOut,
} from "lucide-react";
import { performLogout } from "@/components/logout-button";
import { useAuth } from "@/hooks/use-auth";
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
  { href: "/sla", label: "SLA & Breaches", icon: AlertTriangle },
  { href: "/md", label: "Executive overview", icon: LineChart, mdOverviewOnly: true },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/admin", label: "Admin Panel", icon: KeyRound, superAdminOnly: true },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoading } = useAuth();

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

  const filteredNav = nav.filter((item) => {
    if (user.role === "MANAGING_DIRECTOR") {
      return item.href === "/md" || item.href === "/notifications";
    }
    if ("superAdminOnly" in item && item.superAdminOnly && user.role !== "SUPER_ADMIN" && user.role !== "MANAGING_DIRECTOR") {
      return false;
    }
    if ("mdOverviewOnly" in item && item.mdOverviewOnly && user.role !== "SUPER_ADMIN" && user.role !== "MANAGING_DIRECTOR") {
      return false;
    }
    if (item.href === "/sla" && !["SUPER_ADMIN", "MANAGING_DIRECTOR"].includes(user.role)) return false;
    return true;
  });

  return (
    <div className="min-h-screen flex bg-white">
      <aside className="w-64 border-r border-slate-100 bg-slate-50/80 flex flex-col">
        <div className="p-6 border-b border-slate-100">
          <Link
            href={user.role === "MANAGING_DIRECTOR" ? "/md" : "/dashboard"}
            className="font-semibold text-lg text-slate-900"
          >
            Dashboard
          </Link>
        </div>
        <nav className="flex-1 p-3 space-y-0.5">
          {filteredNav.map((item) => {
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
      </aside>
      <div className="flex min-w-0 flex-1 flex-col bg-white">
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-slate-100 bg-white px-4 md:px-8">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold leading-tight text-slate-900">
              Welcome back, {user.name}
            </h2>
            <p className="text-xs text-slate-500">
              {unreadCount > 0 ? `You have ${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}.` : "You’re all caught up."}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium leading-tight text-slate-900">{user.name}</p>
              <p className="text-xs text-slate-500 wrap-break-word">{user.email}</p>
            </div>
            <Link
              href="/notifications"
              className="relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
              aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"}
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              ) : null}
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" aria-label="Account menu">
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium text-slate-900">{user.name}</p>
                    <p className="text-xs text-slate-500">{user.email}</p>
                    <p className="text-[10px] uppercase tracking-wide text-slate-400">{user.role.replace("_", " ")}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link
                    href="/notifications"
                    className="flex w-full cursor-pointer items-center justify-between gap-2"
                  >
                    <span>Notifications</span>
                    {unreadCount > 0 ? (
                      <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                    ) : null}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="cursor-pointer text-red-600 focus:text-red-600"
                  onClick={() => performLogout(router)}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6 md:p-8">{children}</main>
      </div>
    </div>
  );
}
