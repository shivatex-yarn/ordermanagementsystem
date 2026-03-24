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
  KeyRound,
  LineChart,
} from "lucide-react";
import { LogoutButton } from "@/components/logout-button";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/orders", label: "Enquiries", icon: Package },
  { href: "/divisions", label: "Divisions", icon: Building2 },
  { href: "/audit", label: "Audit Log", icon: FileText },
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
  const { user, isLoading } = useAuth();

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
    if ("superAdminOnly" in item && item.superAdminOnly && user.role !== "SUPER_ADMIN" && user.role !== "MANAGING_DIRECTOR") return false;
    if ("mdOverviewOnly" in item && item.mdOverviewOnly && user.role !== "SUPER_ADMIN" && user.role !== "MANAGING_DIRECTOR") return false;
    if (item.href === "/audit" && !["SUPER_ADMIN", "MANAGING_DIRECTOR", "MANAGER"].includes(user.role)) return false;
    if (item.href === "/sla" && !["SUPER_ADMIN", "MANAGING_DIRECTOR", "MANAGER"].includes(user.role)) return false;
    return true;
  });

  return (
    <div className="min-h-screen flex bg-white">
      <aside className="w-64 border-r border-slate-100 bg-slate-50/80 flex flex-col">
        <div className="p-6 border-b border-slate-100">
          <Link href="/dashboard" className="font-semibold text-lg text-slate-900">
            Enquiry Management
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
        <div className="p-3 border-t border-slate-100">
          <div className="px-3 py-2 text-xs text-slate-500">
            {user.name} · {user.role.replace("_", " ")}
          </div>
          <LogoutButton />
        </div>
      </aside>
      <main className="flex-1 overflow-auto p-6 md:p-8 bg-white">{children}</main>
    </div>
  );
}
