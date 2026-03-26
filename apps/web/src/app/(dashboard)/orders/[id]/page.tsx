"use client";

import { use } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
import { formatEnquiryNumber } from "@/lib/enquiry-display";

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "success" | "warning"> = {
  PLACED: "secondary",
  IN_PROGRESS: "default",
  TRANSFERRED: "warning",
  REJECTED: "destructive",
  COMPLETED: "success",
};

async function fetchOrder(id: number): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any -- wide API payload
  const res = await fetch(`/api/orders/${id}`, { credentials: "include" });
  const raw: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const errMsg =
      raw && typeof raw === "object" && "error" in raw && typeof (raw as { error: unknown }).error === "string"
        ? (raw as { error: string }).error
        : "";
    const msg = errMsg.length
      ? errMsg
      : res.status === 403
        ? "You do not have access to this enquiry."
        : res.status === 404
          ? "Enquiry not found."
          : res.status === 401
            ? "Session expired — please sign in again."
            : `Could not load enquiry (${res.status}).`;
    throw new Error(msg);
  }
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid response from server.");
  }
  return raw;
}

type AuditLogRow = {
  id: number;
  action: string;
  createdAt: string;
  payload: unknown;
  user: { name: string; email: string } | null;
};

function auditPayloadSummary(action: string, payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const p = payload as Record<string, unknown>;
  switch (action) {
    case "OrderTransferred":
      return p.reason ? `Reason: ${String(p.reason)}` : "";
    case "OrderRejected":
      return p.reason ? `Reason: ${String(p.reason)}` : "";
    case "OrderCompleted":
      return p.durationMs != null ? `Elapsed: ${Math.round(Number(p.durationMs) / 1000)}s` : "";
    default:
      return "";
  }
}

function auditActionLabel(action: string): string {
  const m: Record<string, string> = {
    OrderCreated: "Enquiry placed",
    OrderAccepted: "Accepted by division",
    OrderTransferred: "Transferred",
    OrderRejected: "Rejected",
    OrderReceived: "Received in new division",
    OrderCompleted: "Completed",
    SampleDetailsUpdated: "Sample details updated",
    SampleApproved: "Sample approved",
    SampleShipped: "Sample sent / shipped",
    SalesFeedbackRecorded: "Sales / user response",
    SLABreachDetected: "SLA breach",
  };
  return m[action] ?? action;
}

/** Card + label styling per event type for the detailed timeline. */
function auditTimelineStyles(action: string): {
  card: string;
  label: string;
  time: string;
  user: string;
  extra: string;
} {
  const base =
    "relative overflow-hidden rounded-2xl border p-4 text-sm shadow-sm transition-[box-shadow,transform] duration-200 hover:shadow-md";
  switch (action) {
    case "OrderCreated":
      return {
        card: `${base} border-slate-200/90 bg-gradient-to-br from-slate-50 via-white to-violet-50/30 ring-1 ring-slate-500/5`,
        label:
          "inline-flex items-center rounded-full bg-slate-800 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white shadow-sm",
        time: "font-mono text-xs font-medium text-slate-600 tabular-nums",
        user: "mt-2 text-slate-700",
        extra: "mt-2 border-t border-slate-100/80 pt-2 text-slate-600",
      };
    case "OrderAccepted":
      return {
        card: `${base} border-emerald-200/80 bg-gradient-to-br from-emerald-50/90 via-white to-teal-50/50 ring-1 ring-emerald-500/10`,
        label:
          "inline-flex items-center rounded-full bg-emerald-600 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white shadow-sm shadow-emerald-600/25",
        time: "font-mono text-xs font-medium text-emerald-900/70 tabular-nums",
        user: "mt-2 text-emerald-950/80",
        extra: "mt-2 border-t border-emerald-100/80 pt-2 text-emerald-900/75",
      };
    case "OrderTransferred":
      return {
        card: `${base} border-amber-200/80 bg-gradient-to-br from-amber-50/90 via-white to-orange-50/40 ring-1 ring-amber-400/15`,
        label:
          "inline-flex items-center rounded-full bg-amber-500 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white shadow-sm shadow-amber-500/30",
        time: "font-mono text-xs font-medium text-amber-900/70 tabular-nums",
        user: "mt-2 text-amber-950/80",
        extra: "mt-2 border-t border-amber-100/80 pt-2 text-amber-950/75",
      };
    case "OrderRejected":
      return {
        card: `${base} border-rose-200/80 bg-gradient-to-br from-rose-50/90 via-white to-red-50/40 ring-1 ring-rose-500/15`,
        label:
          "inline-flex items-center rounded-full bg-rose-600 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white shadow-sm shadow-rose-600/25",
        time: "font-mono text-xs font-medium text-rose-900/70 tabular-nums",
        user: "mt-2 text-rose-950/85",
        extra: "mt-2 border-t border-rose-100/80 pt-2 text-rose-900/80",
      };
    case "OrderReceived":
      return {
        card: `${base} border-sky-200/80 bg-gradient-to-br from-sky-50/90 via-white to-blue-50/40 ring-1 ring-sky-400/15`,
        label:
          "inline-flex items-center rounded-full bg-sky-600 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white shadow-sm shadow-sky-600/20",
        time: "font-mono text-xs font-medium text-sky-900/70 tabular-nums",
        user: "mt-2 text-sky-950/80",
        extra: "mt-2 border-t border-sky-100/80 pt-2 text-sky-900/75",
      };
    case "OrderCompleted":
      return {
        card: `${base} border-green-200/80 bg-gradient-to-br from-green-50/90 via-white to-emerald-50/30 ring-1 ring-green-500/12`,
        label:
          "inline-flex items-center rounded-full bg-green-600 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white shadow-sm shadow-green-600/25",
        time: "font-mono text-xs font-medium text-green-900/70 tabular-nums",
        user: "mt-2 text-green-950/80",
        extra: "mt-2 border-t border-green-100/80 pt-2 text-green-900/75",
      };
    case "SampleDetailsUpdated":
      return {
        card: `${base} border-violet-200/80 bg-gradient-to-br from-violet-50/80 via-white to-fuchsia-50/30 ring-1 ring-violet-400/12`,
        label:
          "inline-flex items-center rounded-full bg-violet-600 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white shadow-sm shadow-violet-600/20",
        time: "font-mono text-xs font-medium text-violet-900/70 tabular-nums",
        user: "mt-2 text-violet-950/80",
        extra: "mt-2 border-t border-violet-100/80 pt-2 text-violet-900/75",
      };
    case "SampleApproved":
      return {
        card: `${base} border-cyan-200/80 bg-gradient-to-br from-cyan-50/90 via-white to-teal-50/35 ring-1 ring-cyan-400/15`,
        label:
          "inline-flex items-center rounded-full bg-cyan-600 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white shadow-sm shadow-cyan-600/20",
        time: "font-mono text-xs font-medium text-cyan-900/70 tabular-nums",
        user: "mt-2 text-cyan-950/80",
        extra: "mt-2 border-t border-cyan-100/80 pt-2 text-cyan-900/75",
      };
    case "SampleShipped":
      return {
        card: `${base} border-indigo-200/80 bg-gradient-to-br from-indigo-50/85 via-white to-blue-50/35 ring-1 ring-indigo-400/12`,
        label:
          "inline-flex items-center rounded-full bg-indigo-600 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white shadow-sm shadow-indigo-600/20",
        time: "font-mono text-xs font-medium text-indigo-900/70 tabular-nums",
        user: "mt-2 text-indigo-950/80",
        extra: "mt-2 border-t border-indigo-100/80 pt-2 text-indigo-900/75",
      };
    case "SalesFeedbackRecorded":
      return {
        card: `${base} border-fuchsia-200/75 bg-gradient-to-br from-fuchsia-50/85 via-white to-pink-50/30 ring-1 ring-fuchsia-400/12`,
        label:
          "inline-flex items-center rounded-full bg-fuchsia-600 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white shadow-sm shadow-fuchsia-600/20",
        time: "font-mono text-xs font-medium text-fuchsia-900/70 tabular-nums",
        user: "mt-2 text-fuchsia-950/80",
        extra: "mt-2 border-t border-fuchsia-100/80 pt-2 text-fuchsia-900/75",
      };
    case "SLABreachDetected":
      return {
        card: `${base} border-orange-300/80 bg-gradient-to-br from-orange-50/95 via-white to-amber-50/40 ring-1 ring-orange-500/20`,
        label:
          "inline-flex items-center rounded-full bg-orange-600 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white shadow-sm shadow-orange-500/25",
        time: "font-mono text-xs font-medium text-orange-900/75 tabular-nums",
        user: "mt-2 text-orange-950/85",
        extra: "mt-2 border-t border-orange-100/90 pt-2 text-orange-950/80",
      };
    default:
      return {
        card: `${base} border-slate-200/80 bg-gradient-to-br from-slate-50/80 via-white to-slate-100/30 ring-1 ring-slate-400/10`,
        label:
          "inline-flex items-center rounded-full bg-slate-600 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white shadow-sm",
        time: "font-mono text-xs font-medium text-slate-600 tabular-nums",
        user: "mt-2 text-slate-700",
        extra: "mt-2 border-t border-slate-100 pt-2 text-slate-600",
      };
  }
}

function EnquiryPipelineStrip({
  order,
}: {
  order: {
    status: string;
    acceptedBy?: { name: string } | null;
    transferCount: number;
    sampleRequested: boolean;
    sampleApprovedAt: string | null | undefined;
    sampleShippedAt: string | null | undefined;
  };
}) {
  const steps: { label: string; done: boolean }[] = [
    { label: "Placed", done: true },
    {
      label: "Accepted / in progress",
      done:
        Boolean(order.acceptedBy) ||
        ["IN_PROGRESS", "COMPLETED", "REJECTED", "TRANSFERRED"].includes(order.status),
    },
  ];
  if (order.transferCount > 0) {
    steps.push({ label: `Transfer recorded (${order.transferCount})`, done: true });
  }
  if (order.sampleRequested) {
    const done = Boolean(order.sampleShippedAt);
    steps.push({
      label: order.sampleShippedAt
        ? "Sample sent"
        : order.sampleApprovedAt
          ? "Sample approved (awaiting ship)"
          : "Sample workflow",
      done,
    });
  }
  steps.push({
    label: "Completed or rejected",
    done: order.status === "COMPLETED" || order.status === "REJECTED",
  });
  return (
    <div className="flex flex-wrap gap-2">
      {steps.map((s) => (
        <span
          key={s.label}
          className={`rounded-full px-3 py-1 text-xs font-medium border ${
            s.done
              ? "bg-emerald-50 text-emerald-900 border-emerald-200"
              : "bg-slate-50 text-slate-500 border-slate-100"
          }`}
        >
          {s.label}
        </span>
      ))}
    </div>
  );
}

function sampleProofUrlKind(url: string): "image" | "pdf" | "other" {
  const path = url.split("?")[0].toLowerCase();
  if (/\.(png|jpe?g|gif|webp)$/i.test(path)) return "image";
  if (/\.pdf$/i.test(path)) return "pdf";
  return "other";
}

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const orderId = Number(id);
  const searchParams = useSearchParams();
  const isAuditView = searchParams.get("from") === "audit";
  const showInteractiveUi = !isAuditView;
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [acceptReason, setAcceptReason] = useState("");
  const [transferReason, setTransferReason] = useState("");
  const [toDivisionId, setToDivisionId] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editCompanyName, setEditCompanyName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [commentBody, setCommentBody] = useState("");
  const [commentError, setCommentError] = useState("");
  const [actionError, setActionError] = useState("");
  const [sampleDetails, setSampleDetails] = useState("");
  const [sampleQuantity, setSampleQuantity] = useState("");
  const [sampleWeight, setSampleWeight] = useState("");
  const [sentByCourier, setSentByCourier] = useState(true);
  const [courierName, setCourierName] = useState("");
  const [trackingId, setTrackingId] = useState("");
  const [sampleProofFile, setSampleProofFile] = useState<File | null>(null);
  const [salesFeedback, setSalesFeedback] = useState("");
  const [sampleError, setSampleError] = useState("");

  const {
    data: order,
    isLoading,
    isError,
    error: orderError,
    refetch: refetchOrder,
  } = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => fetchOrder(orderId),
    enabled: Number.isInteger(orderId),
    retry: 1,
  });

  const { data: auditData, isLoading: auditLoading } = useQuery({
    queryKey: ["order-audit", orderId],
    queryFn: async () => {
      const res = await fetch(`/api/audit?orderId=${orderId}&limit=200`, { credentials: "include" });
      if (!res.ok) throw new Error("Could not load activity log");
      return res.json() as Promise<{ logs: AuditLogRow[] }>;
    },
    enabled: isAuditView && Number.isInteger(orderId),
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
    mutationFn: () =>
      fetch(`/api/orders/${orderId}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reason: acceptReason }),
      }),
    onSuccess: async (res) => {
      if (res.ok) {
        setAcceptOpen(false);
        setAcceptReason("");
        setActionError("");
        queryClient.invalidateQueries({ queryKey: ["order", orderId] });
        queryClient.invalidateQueries({ queryKey: ["orders"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        return;
      }
      const data = await res.json().catch(() => ({}));
      setActionError((data as { error?: string }).error || "Failed to accept enquiry");
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
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
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
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      }
    },
  });
  const receiveMutation = useMutation({
    mutationFn: () => fetch(`/api/orders/${orderId}/receive`, { method: "POST", credentials: "include" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order", orderId] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
  const completeMutation = useMutation({
    mutationFn: () => fetch(`/api/orders/${orderId}/complete`, { method: "POST", credentials: "include" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order", orderId] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { companyName?: string; description?: string; customFields?: Record<string, string> }) =>
      fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      }),
    onSuccess: (res) => {
      if (res.ok) {
        setEditOpen(false);
        queryClient.invalidateQueries({ queryKey: ["order", orderId] });
        queryClient.invalidateQueries({ queryKey: ["orders"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      }
    },
  });

  const commentMutation = useMutation({
    mutationFn: (body: string) =>
      fetch(`/api/orders/${orderId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ body }),
      }),
    onSuccess: (res) => {
      if (res.ok) {
        setCommentBody("");
        setCommentError("");
        queryClient.invalidateQueries({ queryKey: ["order", orderId] });
      }
    },
    onError: (err: Error) => setCommentError(err.message),
  });

  const isManager = user && ["MANAGER", "SUPER_ADMIN"].includes(user.role);
  const canAct = order && isManager && ["PLACED", "TRANSFERRED", "IN_PROGRESS"].includes(order.status);
  const mightManageSample =
    user &&
    order &&
    ["MANAGER", "SUPER_ADMIN", "MANAGING_DIRECTOR"].includes(user.role) &&
    !["REJECTED", "COMPLETED"].includes(order.status);
  const mightSubmitFeedback =
    user &&
    order &&
    !["REJECTED"].includes(order.status) &&
    (order.createdById === user.id ||
      ["SUPER_ADMIN", "MANAGING_DIRECTOR"].includes(user.role));

  const sampleMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch(`/api/orders/${orderId}/sample`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || "Sample action failed");
      return data;
    },
    onSuccess: () => {
      setSampleError("");
      setSampleDetails("");
      setSampleQuantity("");
      setSampleWeight("");
      setSentByCourier(true);
      setCourierName("");
      setTrackingId("");
      setSampleProofFile(null);
      setSalesFeedback("");
      queryClient.invalidateQueries({ queryKey: ["order", orderId] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: Error) => setSampleError(err.message),
  });
  const canEdit =
    showInteractiveUi &&
    order &&
    order.status === "PLACED" &&
    user &&
    (Number(user.id) === order.createdById || user.role === "SUPER_ADMIN");
  const canComment = order && user && (isManager || Number(user.id) === order.createdById);

  const backHref = isAuditView ? "/md#audit" : "/orders";
  const backLabel = isAuditView ? "← Activity log" : "← Enquiries";

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" asChild><Link href={backHref}>{backLabel}</Link></Button>
        <div className="text-slate-500">Loading enquiry...</div>
      </div>
    );
  }

  if (isError || !order) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" asChild><Link href={backHref}>{backLabel}</Link></Button>
        <Card>
          <CardHeader>
            <CardTitle>Could not load enquiry</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-600">
            <p>{orderError instanceof Error ? orderError.message : "This enquiry may not exist or you may not have access."}</p>
            <p className="text-slate-500">
              If you recently upgraded the app, ask your admin to run database migrations and clear the enquiry cache.
            </p>
            <Button type="button" variant="outline" size="sm" onClick={() => refetchOrder()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const auditLogsChrono = auditData?.logs ? [...auditData.logs].reverse() : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild><Link href={backHref}>{backLabel}</Link></Button>
          <h1 className="text-2xl font-bold">{formatEnquiryNumber(order.orderNumber)}</h1>
          <Badge variant={statusVariant[order.status]}>{order.status.replace("_", " ")}</Badge>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Enquiry details</CardTitle>
          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => { setEditCompanyName(order.companyName ?? ""); setEditDescription(order.description ?? ""); setEditOpen(true); }}>
              Edit enquiry
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <p>
            <span className="text-slate-500">Company name:</span>{" "}
            {order.companyName?.trim() ? order.companyName : "—"}
          </p>
          <p>
            <span className="text-slate-500">Product description:</span>{" "}
            {order.description?.trim() ? order.description : "—"}
          </p>
          <p>
            <span className="text-slate-500">Created by:</span> {order.createdBy?.name} ({order.createdBy?.email}) ·{" "}
            <span className="text-slate-500">Placed:</span> {new Date(order.createdAt).toLocaleString()}
          </p>
          {user?.role !== "MANAGER" ? (
            <p><span className="text-slate-500">Current division:</span> {order.currentDivision?.name ?? "—"}</p>
          ) : null}
          <p>
            <span className="text-slate-500">Sample requested:</span>{" "}
            {order.sampleRequested ? "Yes" : "No"}
            {order.sampleRequested && !order.sampleRequestNotes?.trim() ? " (no notes)" : null}
          </p>
          {order.sampleRequested && order.sampleRequestNotes?.trim() ? (
            <p>
              <span className="text-slate-500">Sample request notes:</span> {order.sampleRequestNotes}
            </p>
          ) : null}
          {order.customFields && typeof order.customFields === "object" && Object.keys(order.customFields).length > 0 && (
            <div>
              <span className="text-slate-500">Custom fields:</span>
              <ul className="mt-1 list-inside list-disc text-sm">
                {Object.entries(order.customFields as Record<string, unknown>).map(([k, v]) => (
                  <li key={k}><span className="font-medium">{k}:</span> {String(v)}</li>
                ))}
              </ul>
            </div>
          )}
          {order.slaDeadline && <p><span className="text-slate-500">SLA deadline:</span> {new Date(order.slaDeadline).toLocaleString()}</p>}
          {!isAuditView ? (
            <p>
              <span className="text-slate-500">Transfers:</span> {order.transferCount} ·{" "}
              <span className="text-slate-500">Rejections:</span> {order.rejectionCount}
            </p>
          ) : (
            <div className="border-t border-slate-100 pt-4 space-y-4 text-sm">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Project status</p>
                <ul className="space-y-2 list-none pl-0">
                  <li>
                    <span className="text-slate-500">Accepted by division:</span>{" "}
                    {order.acceptedBy ? (
                      <>
                        Yes — {order.acceptedBy.name} ({order.acceptedBy.email})
                      </>
                    ) : (
                      <span className="text-slate-800">Not yet accepted (or pending receive after transfer)</span>
                    )}
                  </li>
                  <li>
                    <span className="text-slate-500">Completed:</span>{" "}
                    {order.completedAt && order.completedBy ? (
                      <>
                        Yes — {order.completedBy.name} ({order.completedBy.email}) on{" "}
                        {new Date(order.completedAt).toLocaleString()}
                      </>
                    ) : (
                      <span className="text-slate-800">No</span>
                    )}
                  </li>
                  <li>
                    <span className="text-slate-500">Final rejection:</span>{" "}
                    {order.status === "REJECTED" && order.rejectedBy ? (
                      <>
                        {order.rejectedBy.name} ({order.rejectedBy.email})
                        {order.rejections?.length
                          ? ` · ${new Date(order.rejections[order.rejections.length - 1].createdAt).toLocaleString()}`
                          : ""}
                      </>
                    ) : (
                      <span className="text-slate-800">—</span>
                    )}
                  </li>
                  <li>
                    <span className="text-slate-500">Workflow position:</span>{" "}
                    <span className="font-medium text-slate-900">{order.status.replace("_", " ")}</span>
                    {user?.role !== "MANAGER" ? (
                      <>
                        {" · "}
                        <span className="text-slate-500">Current division:</span> {order.currentDivision?.name ?? "—"}
                      </>
                    ) : null}
                  </li>
                </ul>
              </div>
              {order.transfers?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
                    Transfer history ({order.transfers.length})
                  </p>
                  <ul className="space-y-3 list-none pl-0">
                    {order.transfers.map(
                      (t: {
                        id: number;
                        fromDivision: { name: string };
                        toDivision: {
                          name: string;
                          managers?: { user: { name: string; email: string } }[];
                        };
                        reason: string;
                        transferredBy: { name: string; email: string };
                        createdAt: string;
                      }) => {
                        const heads =
                          t.toDivision?.managers?.map((m) => `${m.user.name} (${m.user.email})`).join(", ") ||
                          "No division heads assigned";
                        return (
                          <li key={t.id} className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                            <p className="font-medium text-slate-900">
                              {t.fromDivision.name} → {t.toDivision.name}
                            </p>
                            <p className="mt-1 text-slate-600">
                              <span className="text-slate-500">Transferred by:</span> {t.transferredBy.name} (
                              {t.transferredBy.email})
                            </p>
                            <p className="text-slate-600">
                              <span className="text-slate-500">Division responsible (heads):</span> {heads}
                            </p>
                            <p className="mt-1 text-slate-500 text-xs">{new Date(t.createdAt).toLocaleString()}</p>
                            {t.reason?.trim() ? (
                              <p className="mt-2 text-slate-700 border-t border-slate-100 pt-2">{t.reason}</p>
                            ) : null}
                          </li>
                        );
                      }
                    )}
                  </ul>
                </div>
              )}
              {order.rejections?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
                    Rejection events ({order.rejections.length})
                  </p>
                  <ul className="space-y-2 list-none pl-0">
                    {order.rejections.map(
                      (r: {
                        id: number;
                        division: { name: string };
                        reason: string;
                        rejectedBy: { name: string; email: string };
                        createdAt: string;
                      }) => (
                        <li key={r.id} className="rounded-lg border border-red-100 bg-red-50/40 p-3">
                          <p className="text-slate-900">
                            <span className="text-slate-500">Rejected by:</span> {r.rejectedBy.name} (
                            {r.rejectedBy.email})
                          </p>
                          <p className="text-slate-600">
                            <span className="text-slate-500">Division:</span> {r.division.name}
                          </p>
                          <p className="text-slate-500 text-xs mt-1">{new Date(r.createdAt).toLocaleString()}</p>
                          <p className="mt-2 text-slate-800">{r.reason}</p>
                        </li>
                      )
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {!isAuditView && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Enquiry pipeline</CardTitle>
              <p className="text-sm text-slate-500 font-normal">Stages for this enquiry at a glance.</p>
            </CardHeader>
            <CardContent>
              <EnquiryPipelineStrip order={order} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Detailed timestamps</CardTitle>
              <p className="text-sm text-slate-500 font-normal">
                Placed, accept, transfer, rejection, sample, and responses — from the activity log (oldest first).
              </p>
            </CardHeader>
            <CardContent>
              {order.auditLogs?.length ? (
                <div className="relative">
                  <div
                    className="pointer-events-none absolute left-[7px] top-3 bottom-3 w-px bg-linear-to-b from-slate-300/90 via-slate-200/60 to-transparent sm:left-[9px]"
                    aria-hidden
                  />
                  <ul className="relative space-y-4">
                    {(
                      order.auditLogs as {
                        id: number;
                        action: string;
                        createdAt: string;
                        payload: unknown;
                        user: { name: string; email: string } | null;
                      }[]
                    ).map((log) => {
                      const extra = auditPayloadSummary(log.action, log.payload);
                      const st = auditTimelineStyles(log.action);
                      return (
                        <li key={log.id} className="relative flex gap-3 sm:gap-4">
                          <span
                            className="relative z-10 mt-[18px] h-2.5 w-2.5 shrink-0 rounded-full border-2 border-white bg-slate-400 shadow ring-1 ring-slate-200/80"
                            aria-hidden
                          />
                          <div className={`min-w-0 flex-1 ${st.card}`}>
                            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
                              <span className={st.time}>{new Date(log.createdAt).toLocaleString()}</span>
                              <span className={st.label}>{auditActionLabel(log.action)}</span>
                            </div>
                            {log.user ? (
                              <p className={st.user}>
                                <span className="font-medium">{log.user.name}</span>
                                <span className="opacity-50"> · </span>
                                {log.user.email}
                              </p>
                            ) : (
                              <p className="mt-2 text-xs font-medium text-slate-400">System</p>
                            )}
                            {extra ? <p className={st.extra}>{extra}</p> : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : (
                <p className="text-sm text-slate-500">No logged events yet.</p>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {isAuditView && (
        <Card>
          <CardHeader>
            <CardTitle>Activity timeline</CardTitle>
            <p className="text-sm text-slate-500 font-normal">
              Chronological audit log for this enquiry (newest events appear at the bottom).
            </p>
          </CardHeader>
          <CardContent>
            {auditLoading ? (
              <p className="text-sm text-slate-500">Loading timeline…</p>
            ) : auditLogsChrono.length === 0 ? (
              <p className="text-sm text-slate-500">No audit entries recorded.</p>
            ) : (
              <ul className="space-y-3">
                {auditLogsChrono.map((log) => {
                  const extra = auditPayloadSummary(log.action, log.payload);
                  return (
                    <li
                      key={log.id}
                      className="rounded-lg border border-slate-100 bg-slate-50/50 p-3 text-sm"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-slate-400">
                          {new Date(log.createdAt).toLocaleString()}
                        </span>
                        <Badge variant="secondary" className="text-[10px]">
                          {log.action}
                        </Badge>
                      </div>
                      {log.user ? (
                        <p className="mt-1 text-xs text-slate-600">
                          {log.user.name} · {log.user.email}
                        </p>
                      ) : (
                        <p className="mt-1 text-xs text-slate-400">System / integration</p>
                      )}
                      {extra ? <p className="mt-2 text-slate-700">{extra}</p> : null}
                      {log.payload != null ? (
                        <pre className="mt-2 max-h-32 overflow-auto rounded bg-slate-900/5 p-2 text-[11px] text-slate-600">
                          {typeof log.payload === "string"
                            ? log.payload
                            : JSON.stringify(log.payload)}
                        </pre>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {order.sampleRequested && (
        <Card>
          <CardHeader>
            <CardTitle>Sample workflow</CardTitle>
            <p className="text-sm text-slate-500 font-normal">
              Division Head sets details and approves; shipment requires courier and tracking ID. Sales can add
              feedback anytime before rejection.
            </p>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {(order.sampleDetails || order.sampleQuantity) && (
              <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-3 space-y-1">
                {order.sampleDetails && (
                  <p>
                    <span className="text-slate-500">Sample details:</span> {order.sampleDetails}
                  </p>
                )}
                {order.sampleQuantity && (
                  <p>
                    <span className="text-slate-500">Quantity:</span> {order.sampleQuantity}
                  </p>
                )}
                {order.sampleWeight && (
                  <p>
                    <span className="text-slate-500">Weight:</span> {order.sampleWeight}
                  </p>
                )}
              </div>
            )}
            {order.sampleApprovedAt && (
              <p className="text-slate-700">
                <span className="text-slate-500">Approved</span>{" "}
                {new Date(order.sampleApprovedAt).toLocaleString()}
                {order.sampleApprovedBy?.name && ` · ${order.sampleApprovedBy.name}`}
              </p>
            )}
            {order.sampleShippedAt && (
              <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-3 space-y-1">
                <p>
                  <span className="text-slate-500">Shipped</span> {new Date(order.sampleShippedAt).toLocaleString()}
                </p>
                <p>
                  <span className="text-slate-500">Sent by courier:</span>{" "}
                  {order.sampleShippedByCourier === false ? "No" : "Yes"}
                </p>
                {order.courierName && (
                  <p>
                    <span className="text-slate-500">Courier:</span> {order.courierName}
                  </p>
                )}
                {order.trackingId && (
                  <p>
                    <span className="text-slate-500">Tracking ID:</span> {order.trackingId}
                  </p>
                )}
                {order.sampleProofUrl && (
                  <div className="space-y-2">
                    <p>
                      <span className="text-slate-500">Proof:</span>{" "}
                      <a
                        className="text-blue-700 underline"
                        href={order.sampleProofUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open in new tab
                      </a>
                    </p>
                    {sampleProofUrlKind(order.sampleProofUrl) === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element -- user-uploaded proof from our public/uploads
                      <img
                        src={order.sampleProofUrl}
                        alt="Sample shipment proof"
                        className="mt-1 max-h-96 w-full max-w-lg rounded-md border border-slate-200 bg-white object-contain"
                      />
                    ) : sampleProofUrlKind(order.sampleProofUrl) === "pdf" ? (
                      <iframe
                        title="Sample shipment proof"
                        src={order.sampleProofUrl}
                        className="mt-1 h-112 w-full max-w-2xl rounded-md border border-slate-200 bg-white"
                      />
                    ) : null}
                  </div>
                )}
              </div>
            )}
            {order.salesFeedback && (
              <p>
                <span className="text-slate-500">Sales feedback:</span> {order.salesFeedback}{" "}
                <span className="text-slate-400">
                  ({order.salesFeedbackAt ? new Date(order.salesFeedbackAt).toLocaleString() : ""})
                </span>
              </p>
            )}

            {sampleError && (
              <div className="rounded-lg border border-red-100 bg-red-50 text-red-700 text-sm p-3">{sampleError}</div>
            )}

            {showInteractiveUi && mightManageSample && (
              <div className="space-y-4 border-t border-slate-100 pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Division actions</p>
                {!order.sampleApprovedAt && (
                  <div className="space-y-2">
                    <Label>Update sample details / quantity</Label>
                    <textarea
                      value={sampleDetails}
                      onChange={(e) => setSampleDetails(e.target.value)}
                      placeholder="Sample specifications, color, finish…"
                      rows={2}
                      className="flex min-h-[56px] w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                    />
                    <Input
                      value={sampleQuantity}
                      onChange={(e) => setSampleQuantity(e.target.value)}
                      placeholder="e.g. 2 meters, 3 swatches"
                    />
                    <Input
                      value={sampleWeight}
                      onChange={(e) => setSampleWeight(e.target.value)}
                      placeholder="Weight (e.g. 250 gsm, 1.5 kg)"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={
                        sampleMutation.isPending ||
                        (!sampleDetails.trim() && !sampleQuantity.trim() && !sampleWeight.trim())
                      }
                      onClick={() =>
                        sampleMutation.mutate({
                          action: "setDetails",
                          sampleDetails: sampleDetails.trim() || undefined,
                          sampleQuantity: sampleQuantity.trim() || undefined,
                          sampleWeight: sampleWeight.trim() || undefined,
                        })
                      }
                    >
                      Save sample details
                    </Button>
                  </div>
                )}
                {!order.sampleApprovedAt && (
                  <Button
                    type="button"
                    size="sm"
                    disabled={sampleMutation.isPending}
                    onClick={() => sampleMutation.mutate({ action: "approve" })}
                  >
                    Approve sample
                  </Button>
                )}
                {order.sampleApprovedAt && !order.sampleShippedAt && (
                  <div className="space-y-2">
                    <Label>Record shipment</Label>
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={sentByCourier}
                        onChange={(e) => setSentByCourier(e.target.checked)}
                      />
                      Sent by courier (requires courier + tracking)
                    </label>
                    {sentByCourier && (
                      <>
                        <Input
                          value={courierName}
                          onChange={(e) => setCourierName(e.target.value)}
                          placeholder="Courier name"
                        />
                        <Input
                          value={trackingId}
                          onChange={(e) => setTrackingId(e.target.value)}
                          placeholder="Tracking ID"
                        />
                      </>
                    )}
                    <div className="space-y-1">
                      <Label>Proof (optional: png/jpg/webp/pdf, max 5MB)</Label>
                      <input
                        type="file"
                        accept=".png,.jpg,.jpeg,.webp,.pdf"
                        onChange={(e) => setSampleProofFile(e.target.files?.[0] ?? null)}
                      />
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      disabled={
                        sampleMutation.isPending ||
                        (sentByCourier && (!courierName.trim() || !trackingId.trim()))
                      }
                      onClick={async () => {
                        try {
                          setSampleError("");
                          let proofUrl: string | undefined;
                          if (sampleProofFile) {
                            const fd = new FormData();
                            fd.append("file", sampleProofFile);
                            const res = await fetch(`/api/orders/${orderId}/sample-proof`, {
                              method: "POST",
                              credentials: "include",
                              body: fd,
                            });
                            const contentType = res.headers.get("content-type") ?? "";
                            const data = contentType.includes("application/json")
                              ? await res.json().catch(() => ({}))
                              : {};
                            if (!res.ok) {
                              throw new Error(
                                  (data as { error?: string; detail?: string }).detail ||
                                  (data as { error?: string; detail?: string }).error ||
                                  `Failed to upload proof (${res.status})`
                              );
                            }
                            proofUrl =
                              typeof (data as { url?: unknown }).url === "string"
                                ? (data as { url: string }).url
                                : undefined;
                          }
                          sampleMutation.mutate({
                            action: "ship",
                            sentByCourier,
                            courierName: sentByCourier ? courierName.trim() : undefined,
                            trackingId: sentByCourier ? trackingId.trim() : undefined,
                            sampleProofUrl: proofUrl,
                          });
                        } catch (e) {
                          setSampleError(e instanceof Error ? e.message : String(e));
                        }
                      }}
                    >
                      Mark sample shipped
                    </Button>
                  </div>
                )}
              </div>
            )}

            {showInteractiveUi && mightSubmitFeedback && (
              <div className="space-y-2 border-t border-slate-100 pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Sales feedback</p>
                <textarea
                  value={salesFeedback}
                  onChange={(e) => setSalesFeedback(e.target.value)}
                  placeholder="Customer reaction, follow-up needed…"
                  rows={3}
                  className="flex min-h-[72px] w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={sampleMutation.isPending || !salesFeedback.trim()}
                  onClick={() =>
                    sampleMutation.mutate({ action: "salesFeedback", salesFeedback: salesFeedback.trim() })
                  }
                >
                  Submit feedback
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {order.editHistory?.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Edit history</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {order.editHistory.map((h: { id: number; fieldName: string; oldValue: string | null; newValue: string | null; user: { name: string }; createdAt: string }) => (
                <li key={h.id} className="rounded border border-slate-100 p-2">
                  <span className="font-medium">{h.fieldName}</span>: &quot;{h.oldValue ?? "—"}&quot; → &quot;{h.newValue ?? "—"}&quot;
                  <span className="text-slate-500 ml-2">by {h.user.name} at {new Date(h.createdAt).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {((canComment && showInteractiveUi) || (isAuditView && (order.comments?.length ?? 0) > 0)) && (
        <Card>
          <CardHeader><CardTitle>Comments</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {order.comments?.length > 0 ? (
              <ul className="space-y-2">
                {order.comments.map((c: { id: number; body: string; user: { name: string }; createdAt: string }) => (
                  <li key={c.id} className="rounded border border-slate-100 p-3 text-sm">
                    <p>{c.body}</p>
                    <p className="text-slate-500 mt-1">— {c.user.name} · {new Date(c.createdAt).toLocaleString()}</p>
                  </li>
                ))}
              </ul>
            ) : (
              canComment &&
              showInteractiveUi && <p className="text-slate-500 text-sm">No comments yet.</p>
            )}
            {canComment && showInteractiveUi && (
              <form onSubmit={(e) => { e.preventDefault(); if (commentBody.trim()) commentMutation.mutate(commentBody.trim()); }} className="flex gap-2">
                <Input value={commentBody} onChange={(e) => setCommentBody(e.target.value)} placeholder="Add a comment..." className="flex-1" />
                <Button type="submit" disabled={!commentBody.trim() || commentMutation.isPending}>Add</Button>
              </form>
            )}
            {commentError && <p className="text-sm text-red-600">{commentError}</p>}
          </CardContent>
        </Card>
      )}

      {!isAuditView && order.transfers?.length > 0 && (
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

      {!isAuditView && order.rejections?.length > 0 && (
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

      {canAct && showInteractiveUi && (
        <Card>
          <CardHeader><CardTitle>Actions</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {(order.status === "PLACED" || order.status === "TRANSFERRED") && (
              <Button onClick={() => setAcceptOpen(true)} disabled={acceptMutation.isPending}>
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
            {actionError && <p className="w-full text-sm text-red-600">{actionError}</p>}
          </CardContent>
        </Card>
      )}

      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Transfer enquiry</DialogTitle></DialogHeader>
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
              <textarea
                value={transferReason}
                onChange={(e) => setTransferReason(e.target.value)}
                placeholder="Transfer reason"
                rows={4}
                className="flex min-h-[96px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
              />
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

      <Dialog open={acceptOpen} onOpenChange={(open) => {
        setAcceptOpen(open);
        if (!open) {
          setAcceptReason("");
          setActionError("");
        }
      }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Accept enquiry</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Reason (min 10 characters, mandatory)</Label>
              <textarea
                value={acceptReason}
                onChange={(e) => setAcceptReason(e.target.value)}
                placeholder="Reason for accepting this enquiry"
                rows={4}
                className="flex min-h-[96px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAcceptOpen(false)}>Cancel</Button>
            <Button
              onClick={() => acceptMutation.mutate()}
              disabled={acceptReason.length < 10 || acceptMutation.isPending}
            >
              Accept
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject enquiry</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Reason (min 10 characters, mandatory)</Label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Detailed rejection reason"
                rows={4}
                className="flex min-h-[96px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
              />
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

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit enquiry</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Company name</Label>
              <Input value={editCompanyName} onChange={(e) => setEditCompanyName(e.target.value)} placeholder="Company name" />
            </div>
            <div className="space-y-2">
              <Label>Product description</Label>
              <Input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} placeholder="Product description" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button
              onClick={() => updateMutation.mutate({
                companyName: editCompanyName.trim() || undefined,
                description: editDescription.trim() || undefined,
                customFields: order?.customFields as Record<string, string> | undefined,
              })}
              disabled={!editCompanyName.trim() || !editDescription.trim() || updateMutation.isPending}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
