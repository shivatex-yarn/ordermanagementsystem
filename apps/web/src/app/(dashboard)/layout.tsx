"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  Building2,
  FileText,
  Bell,
  AlertTriangle,
} from "lucide-react";
import { LogoutButton } from "@/components/logout-button";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/orders", label: "Orders", icon: Package },
  { href: "/divisions", label: "Divisions", icon: Building2 },
  { href: "/audit", label: "Audit Log", icon: FileText },
  { href: "/sla", label: "SLA & Breaches", icon: AlertTriangle },
  { href: "/notifications", label: "Notifications", icon: Bell },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="animate-pulse text-slate-500">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="text-center">
          <p className="text-slate-600 dark:text-slate-400 mb-4">Please sign in.</p>
          <Button asChild>
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </div>
    );
  }

  const filteredNav = nav.filter((item) => {
    if (item.href === "/audit" && !["SUPER_ADMIN", "MANAGER"].includes(user.role)) return false;
    if (item.href === "/sla" && !["SUPER_ADMIN", "MANAGER"].includes(user.role)) return false;
    return true;
  });

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950">
      <aside className="w-64 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col">
        <div className="p-6 border-b border-slate-200 dark:border-slate-800">
          <Link href="/dashboard" className="font-semibold text-lg text-slate-900 dark:text-white">
            Order Management
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
                    ? "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                )}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-slate-200 dark:border-slate-800">
          <div className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
            {user.name} · {user.role.replace("_", " ")}
          </div>
          <LogoutButton />
        </div>
      </aside>
      <main className="flex-1 overflow-auto p-6 md:p-8">{children}</main>
    </div>
  );
}
