"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, Building2, AlertTriangle, CheckCircle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

async function fetchStats() {
  const [ordersRes, divisionsRes, slaRes] = await Promise.all([
    fetch("/api/orders?limit=1", { credentials: "include" }),
    fetch("/api/divisions", { credentials: "include" }),
    fetch("/api/sla", { credentials: "include" }),
  ]);
  const ordersData = ordersRes.ok ? await ordersRes.json() : { total: 0 };
  const divisionsData = divisionsRes.ok ? await divisionsRes.json() : { divisions: [] };
  const slaData = slaRes.ok ? await slaRes.json() : { breaches: [], ordersAtRisk: [] };
  return {
    totalOrders: ordersData.total ?? 0,
    divisionsCount: divisionsData.divisions?.length ?? 0,
    slaBreaches: slaData.breaches?.length ?? 0,
    ordersAtRisk: slaData.ordersAtRisk?.length ?? 0,
  };
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { data: stats, isLoading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: fetchStats,
  });

  if (isLoading || !stats) {
    return (
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="h-4 w-32 bg-slate-200 rounded" />
            </CardHeader>
            <CardContent>
              <div className="h-8 w-16 bg-slate-200 rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const cards = [
    { title: "Total Orders", value: stats.totalOrders, icon: Package },
    { title: "Divisions", value: stats.divisionsCount, icon: Building2 },
    { title: "SLA Breaches", value: stats.slaBreaches, icon: AlertTriangle, alert: stats.slaBreaches > 0 },
    { title: "Orders at Risk", value: stats.ordersAtRisk, icon: CheckCircle, alert: stats.ordersAtRisk > 0 },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-slate-500 mt-1">
          Welcome back, {user?.name}. Here’s an overview of your orders and SLA.
        </p>
      </div>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.title} className={card.alert ? "border-amber-200" : ""}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-slate-500">
                  {card.title}
                </CardTitle>
                <Icon className="h-4 w-4 text-slate-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{card.value}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
