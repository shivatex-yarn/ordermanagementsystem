"use client";

import { use } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "success" | "warning"> = {
  PLACED: "secondary",
  IN_PROGRESS: "default",
  TRANSFERRED: "warning",
  REJECTED: "destructive",
  COMPLETED: "success",
};

async function fetchOrder(id: number) {
  const res = await fetch(`/api/orders/${id}`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch order");
  return res.json();
}

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const orderId = Number(id);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [transferOpen, setTransferOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [transferReason, setTransferReason] = useState("");
  const [toDivisionId, setToDivisionId] = useState("");
  const [rejectReason, setRejectReason] = useState("");

  const { data: order, isLoading } = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => fetchOrder(orderId),
    enabled: Number.isInteger(orderId),
  });

  const { data: divisionsData } = useQuery({
    queryKey: ["divisions"],
    queryFn: async () => {
      const res = await fetch("/api/divisions", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch divisions");
      return res.json();
    },
  });
  const divisions = divisionsData?.divisions ?? [];

  const acceptMutation = useMutation({
    mutationFn: () => fetch(`/api/orders/${orderId}/accept`, { method: "POST", credentials: "include" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order", orderId] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
  });
  const transferMutation = useMutation({
    mutationFn: () =>
      fetch(`/api/orders/${orderId}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ toDivisionId: Number(toDivisionId), reason: transferReason }),
      }),
    onSuccess: (res) => {
      if (res.ok) {
        setTransferOpen(false);
        setTransferReason("");
        setToDivisionId("");
        queryClient.invalidateQueries({ queryKey: ["order", orderId] });
        queryClient.invalidateQueries({ queryKey: ["orders"] });
      }
    },
  });
  const rejectMutation = useMutation({
    mutationFn: () =>
      fetch(`/api/orders/${orderId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reason: rejectReason }),
      }),
    onSuccess: (res) => {
      if (res.ok) {
        setRejectOpen(false);
        setRejectReason("");
        queryClient.invalidateQueries({ queryKey: ["order", orderId] });
        queryClient.invalidateQueries({ queryKey: ["orders"] });
      }
    },
  });
  const receiveMutation = useMutation({
    mutationFn: () => fetch(`/api/orders/${orderId}/receive`, { method: "POST", credentials: "include" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order", orderId] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
  });
  const completeMutation = useMutation({
    mutationFn: () => fetch(`/api/orders/${orderId}/complete`, { method: "POST", credentials: "include" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order", orderId] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
  });

  const isManager = user && ["MANAGER", "SUPER_ADMIN"].includes(user.role);
  const canAct = order && isManager && ["PLACED", "TRANSFERRED", "IN_PROGRESS"].includes(order.status);

  if (isLoading || !order) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" asChild><Link href="/orders">← Orders</Link></Button>
        <div className="text-slate-500">Loading order...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild><Link href="/orders">← Orders</Link></Button>
          <h1 className="text-2xl font-bold">{order.orderNumber}</h1>
          <Badge variant={statusVariant[order.status]}>{order.status.replace("_", " ")}</Badge>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p><span className="text-slate-500">Created by:</span> {order.createdBy?.name} ({order.createdBy?.email})</p>
          <p><span className="text-slate-500">Current division:</span> {order.currentDivision?.name}</p>
          {order.description && <p><span className="text-slate-500">Description:</span> {order.description}</p>}
          <p><span className="text-slate-500">Created:</span> {new Date(order.createdAt).toLocaleString()}</p>
          {order.slaDeadline && <p><span className="text-slate-500">SLA deadline:</span> {new Date(order.slaDeadline).toLocaleString()}</p>}
          <p><span className="text-slate-500">Transfers:</span> {order.transferCount} · <span className="text-slate-500">Rejections:</span> {order.rejectionCount}</p>
        </CardContent>
      </Card>

      {order.transfers?.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Transfers</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {order.transfers.map((t: { id: number; fromDivision: { name: string }; toDivision: { name: string }; reason: string; transferredBy: { name: string }; createdAt: string }) => (
                <li key={t.id} className="text-sm">
                  {t.fromDivision.name} → {t.toDivision.name} by {t.transferredBy.name}: {t.reason} ({new Date(t.createdAt).toLocaleString()})
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {order.rejections?.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Rejections</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {order.rejections.map((r: { id: number; division: { name: string }; reason: string; rejectedBy: { name: string }; createdAt: string }) => (
                <li key={r.id} className="text-sm">
                  {r.division.name}: {r.reason} — {r.rejectedBy.name} ({new Date(r.createdAt).toLocaleString()})
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {canAct && (
        <Card>
          <CardHeader><CardTitle>Actions</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {(order.status === "PLACED" || order.status === "TRANSFERRED") && (
              <Button onClick={() => acceptMutation.mutate()} disabled={acceptMutation.isPending}>
                Accept
              </Button>
            )}
            {order.status === "TRANSFERRED" && (
              <Button onClick={() => receiveMutation.mutate()} disabled={receiveMutation.isPending}>
                Receive
              </Button>
            )}
            {order.status === "IN_PROGRESS" && (
              <Button onClick={() => completeMutation.mutate()} disabled={completeMutation.isPending}>
                Complete
              </Button>
            )}
            <Button variant="outline" onClick={() => setTransferOpen(true)}>Transfer</Button>
            <Button variant="destructive" onClick={() => setRejectOpen(true)}>Reject</Button>
          </CardContent>
        </Card>
      )}

      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Transfer order</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>To division</Label>
              <Select value={toDivisionId} onValueChange={setToDivisionId}>
                <SelectTrigger><SelectValue placeholder="Select division" /></SelectTrigger>
                <SelectContent>
                  {divisions
                    .filter((d: { id: number }) => d.id !== order.currentDivisionId)
                    .map((d: { id: number; name: string }) => (
                      <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Reason (min 10 characters)</Label>
              <Input value={transferReason} onChange={(e) => setTransferReason(e.target.value)} placeholder="Transfer reason" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferOpen(false)}>Cancel</Button>
            <Button
              onClick={() => transferMutation.mutate()}
              disabled={!toDivisionId || transferReason.length < 10 || transferMutation.isPending}
            >
              Transfer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject order</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Reason (min 10 characters, mandatory)</Label>
              <Input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Detailed rejection reason" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => rejectMutation.mutate()}
              disabled={rejectReason.length < 10 || rejectMutation.isPending}
            >
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
