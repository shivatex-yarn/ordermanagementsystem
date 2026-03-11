"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "success" | "warning"> = {
  PLACED: "secondary",
  IN_PROGRESS: "default",
  TRANSFERRED: "warning",
  REJECTED: "destructive",
  COMPLETED: "success",
};

async function fetchOrders(page = 1) {
  const res = await fetch(`/api/orders?page=${page}&limit=20`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch orders");
  return res.json();
}

export default function OrdersPage() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ["orders", page],
    queryFn: () => fetchOrders(page),
  });

  const canCreate = user && ["USER", "SUPERVISOR", "SUPER_ADMIN"].includes(user.role);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Orders</h1>
        {canCreate && (
          <Button asChild>
            <Link href="/orders/new">
              <Plus className="h-4 w-4 mr-2" />
              New order
            </Link>
          </Button>
        )}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>All orders</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-slate-500">Loading...</div>
          ) : !data?.orders?.length ? (
            <div className="py-8 text-center text-slate-500">No orders yet.</div>
          ) : (
            <div className="space-y-4">
              {data.orders.map((order: { id: number; orderNumber: string; status: string; currentDivision: { name: string }; createdAt: string }) => (
                <Link
                  key={order.id}
                  href={`/orders/${order.id}`}
                  className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-800 p-4 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors"
                >
                  <div>
                    <p className="font-medium">{order.orderNumber}</p>
                    <p className="text-sm text-slate-500">{order.currentDivision?.name} · {new Date(order.createdAt).toLocaleDateString()}</p>
                  </div>
                  <Badge variant={statusVariant[order.status] ?? "secondary"}>{order.status.replace("_", " ")}</Badge>
                </Link>
              ))}
              {data.total > data.limit && (
                <div className="flex justify-center gap-2 pt-4">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    Previous
                  </Button>
                  <Button variant="outline" size="sm" disabled={page * data.limit >= data.total} onClick={() => setPage((p) => p + 1)}>
                    Next
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
