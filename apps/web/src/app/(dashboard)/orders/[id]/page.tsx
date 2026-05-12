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
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useMemo, useEffect } from "react";
import { formatEnquiryNumber, formatEnquiryNumberShort } from "@/lib/enquiry-display";
import { userMayViewEnquiryExecInsights } from "@/lib/enquiry-access";
import { EnquiryTimeline } from "@/components/enquiry-timeline";

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "success" | "warning"> = {
  PLACED: "secondary",
  IN_PROGRESS: "default",
  TRANSFERRED: "warning",
  REJECTED: "destructive",
  COMPLETED: "success",
  CANCELLED: "secondary",
};

/** Visual emphasis for placed date: SLA-aware when deadline exists (uses client clock only after mount to avoid SSR mismatch). */
function placedDateClass(
  order: { status: string; slaDeadline?: string | null; createdAt: string },
  nowMs: number | null
): string {
  const terminal = order.status === "COMPLETED" || order.status === "REJECTED" || order.status === "CANCELLED";
  if (terminal) return "text-slate-600";
  if (nowMs == null) return "font-medium text-slate-700";

  if (order.slaDeadline) {
    const deadline = new Date(order.slaDeadline).getTime();
    const now = nowMs;
    if (now > deadline) return "font-medium text-red-600";
    const hoursLeft = (deadline - now) / (1000 * 60 * 60);
    if (hoursLeft < 24) return "font-medium text-amber-700";
    return "font-medium text-emerald-700";
  }
  return "font-medium text-indigo-700";
}

type AuditLogRow = {
  id: number;
  action: string;
  createdAt: string;
  payload: unknown;
  user: { name: string; email: string } | null;
};

/** Shape of an unresolved SLA breach row from GET /api/orders/[id] (matches Prisma include). */
type OrderOpenSlaBreach = {
  breachedAt: string;
  headRejectedAt?: string | null;
  headRejectionMessage?: string | null;
  headRejectedBy?: { name?: string | null } | null;
  division?: { name?: string | null } | null;
};

type DivisionManagerWithUser = { user?: { id?: number } | null };

type OrderDetail = {
  [key: string]: unknown;
  id: number;
  orderNumber: string | null;
  status: string;
  createdAt: string;
  createdById: number;
  receivedById?: number | null;
  currentDivisionId?: number;
  companyName: string | null;
  description: string | null;
  customFields: Record<string, unknown> | null;
  transferCount: number;
  rejectionCount?: number;
  slaDeadline: string | null;
  sampleRequested: boolean;
  sampleRequestNotes: string | null;
  sampleDetails: string | null;
  sampleQuantity: string | null;
  sampleWeight: string | null;
  sampleApprovedAt: string | null | undefined;
  sampleShippedAt: string | null | undefined;
  sampleApprovedBy?: { name?: string | null } | null;
  sampleShippedByCourier?: boolean;
  courierName?: string | null;
  trackingId?: string | null;
  sampleProofUrl?: string | null;
  salesFeedback?: string | null;
  salesFeedbackAt?: string | null;
  cancellationReason?: string | null;
  cancelledAt?: string | null;
  completedAt?: string | null;
  currentDivision?: { id?: number; name?: string | null; managers?: DivisionManagerWithUser[] } | null;
  createdBy?: { name?: string | null; email?: string | null } | null;
  acceptedBy?: { name: string; email?: string | null } | null;
  receivedBy?: { name?: string | null; email?: string | null } | null;
  completedBy?: { name?: string | null; email?: string | null } | null;
  rejectedBy?: { name?: string | null; email?: string | null } | null;
  cancelledBy?: { name?: string | null } | null;
  rejections?: Array<{
    id?: number;
    createdAt: string;
    reason?: string | null;
    division?: { name?: string | null } | null;
    rejectedBy?: { name?: string | null; email?: string | null } | null;
  }>;
  acceptanceReason?: string | null;
  receiveReason?: string | null;
  assignedSupervisorId?: number | null;
  enquiryHandoff?: Record<string, unknown> | null;
  headSampleRequestApprovedAt?: string | null;
  assignedSupervisor?: { id: number; name: string; email: string } | null;
  headSampleRequestApprovedBy?: { name?: string | null; email?: string | null } | null;
  transfers?: Array<{
    id?: number;
    createdAt: string;
    reason?: string | null;
    transferDetails?: string | null;
    fromDivision?: { name?: string | null } | null;
    toDivision?: {
      name?: string | null;
      managers?: Array<{ user?: { name?: string | null; email?: string | null } | null }> | null;
    } | null;
    transferredBy?: { name?: string | null; email?: string | null } | null;
  }>;
  editHistory?: Array<{
    id: number;
    fieldName: string;
    oldValue: string | null;
    newValue: string | null;
    user: { name: string };
    createdAt: string;
  }>;
  slaBreaches?: unknown;
};

async function fetchOrder(id: number): Promise<OrderDetail> {
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
  return raw as OrderDetail;
}

function auditPayloadSummary(action: string, payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const p = payload as Record<string, unknown>;
  switch (action) {
    case "OrderTransferred":
      return p.reason ? `Reason: ${String(p.reason)}` : "";
    case "OrderRejected":
      return p.reason ? `Reason: ${String(p.reason)}` : "";
    case "OrderCancelled":
      return p.reason ? `Reason: ${String(p.reason)}` : "";
    case "OrderCompleted":
      return p.durationMs != null ? `Elapsed: ${Math.round(Number(p.durationMs) / 1000)}s` : "";
    case "SLABreachHeadRejectionSubmitted":
      return p.message ? `Message: ${String(p.message)}` : "";
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
    OrderCancelled: "Cancelled by submitter",
    OrderReceived: "Received in new division",
    OrderCompleted: "Completed",
    SampleDetailsUpdated: "Sample details updated",
    SampleDevelopmentUpdated: "Sample type / development details",
    SampleApproved: "Sample approved",
    SampleShipped: "Sample sent / shipped",
    SalesFeedbackRecorded: "Sales / user response",
    SLABreachDetected: "SLA breach",
    SLABreachHeadRejectionSubmitted: "SLA head rejection submitted",
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
    case "OrderCancelled":
      return {
        card: `${base} border-stone-200/80 bg-gradient-to-br from-stone-50/90 via-white to-neutral-50/30 ring-1 ring-stone-400/12`,
        label:
          "inline-flex items-center rounded-full bg-stone-700 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white shadow-sm shadow-stone-900/15",
        time: "font-mono text-xs font-medium text-stone-700 tabular-nums",
        user: "mt-2 text-stone-800",
        extra: "mt-2 border-t border-stone-100/80 pt-2 text-stone-800",
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
    label: "Completed",
    done: order.status === "COMPLETED",
  });
  steps.push({
    label: "Rejected",
    done: order.status === "REJECTED",
  });
  if (order.status === "CANCELLED") {
    steps.push({ label: "Cancelled by submitter", done: true });
  }
  return (
    <div className="flex flex-wrap gap-2">
      {steps.map((s) => {
        const doneClass =
          s.label === "Rejected" && s.done
            ? "bg-rose-50 text-rose-900 border-rose-200"
            : s.done
              ? "bg-emerald-50 text-emerald-900 border-emerald-200"
              : "bg-slate-50 text-slate-500 border-slate-100";
        return (
          <span key={s.label} className={`rounded-full px-3 py-1 text-xs font-medium border ${doneClass}`}>
            {s.label}
          </span>
        );
      })}
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
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [acceptReason, setAcceptReason] = useState("");
  const [transferReason, setTransferReason] = useState("");
  const [transferDetails, setTransferDetails] = useState("");
  const [toDivisionId, setToDivisionId] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [receiveReason, setReceiveReason] = useState("");
  const [handoffSupervisorId, setHandoffSupervisorId] = useState("");
  const [handoffDevKind, setHandoffDevKind] = useState<"new" | "existing">("new");
  const [handoffNewDetails, setHandoffNewDetails] = useState("");
  const [handoffExistingDetails, setHandoffExistingDetails] = useState("");
  const [handoffError, setHandoffError] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelError, setCancelError] = useState("");
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
  const [approveSampleOpen, setApproveSampleOpen] = useState(false);
  const [sampleDevType, setSampleDevType] = useState<"existing" | "new">("existing");
  const [sampleExistingRef, setSampleExistingRef] = useState("");
  const [newDevOpen, setNewDevOpen] = useState(false);
  const [newDevViewOpen, setNewDevViewOpen] = useState(false);
  const [newDevWhy, setNewDevWhy] = useState("");
  const [newDevTech, setNewDevTech] = useState("");
  const [newDevRequestList, setNewDevRequestList] = useState("");
  const [slaHeadRejectionMessage, setSlaHeadRejectionMessage] = useState("");
  const [slaHeadRejectionError, setSlaHeadRejectionError] = useState("");
  const [clientClockMs, setClientClockMs] = useState<number | null>(null);
  useEffect(() => setClientClockMs(Date.now()), []);

  const {
    data: orderData,
    isLoading,
    isError,
    error: orderError,
    refetch: refetchOrder,
  } = useQuery<OrderDetail>({
    queryKey: ["order", orderId],
    queryFn: () => fetchOrder(orderId),
    enabled: Number.isInteger(orderId),
    retry: 1,
    staleTime: 30_000,
  });

  const order = orderData;

  const { data: auditData, isLoading: auditLoading, isError: auditQueryError } = useQuery({
    queryKey: ["order-audit", orderId],
    queryFn: async () => {
      const res = await fetch(`/api/audit?orderId=${orderId}&limit=60`, { credentials: "include" });
      if (!res.ok) throw new Error("Could not load activity log");
      return (await res.json()) as { logs: AuditLogRow[] };
    },
    enabled: Number.isInteger(orderId) && userMayViewEnquiryExecInsights(user?.role),
    staleTime: 60_000,
  });

  const auditLogsAsc = useMemo(
    () => (auditData?.logs ? [...auditData.logs].reverse() : []),
    [auditData]
  );

  const { data: divisionsData } = useQuery({
    queryKey: ["divisions"],
    queryFn: async () => {
      const res = await fetch("/api/divisions?scope=transfer", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch divisions");
      return res.json();
    },
    enabled: Boolean(user && ["MANAGER", "SUPER_ADMIN"].includes(user.role) && showInteractiveUi),
    staleTime: 5 * 60_000,
  });
  const divisions = divisionsData?.divisions ?? [];

  const needsHandoff =
    Boolean(
      user &&
        order &&
        order.status === "IN_PROGRESS" &&
        !order.enquiryHandoff &&
        showInteractiveUi &&
        (user.role === "MANAGER" || user.role === "SUPER_ADMIN" || user.role === "MANAGING_DIRECTOR")
    );
  const { data: supervisorsData } = useQuery({
    queryKey: ["order-supervisors", orderId],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${orderId}/supervisors`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load supervisors");
      return res.json() as Promise<{ supervisors: { id: number; name: string; email: string }[] }>;
    },
    enabled: Boolean(Number.isInteger(orderId) && needsHandoff),
    staleTime: 60_000,
  });
  const divisionSupervisors = supervisorsData?.supervisors ?? [];

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
        queryClient.invalidateQueries({ queryKey: ["order-audit", orderId] });
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
        body: JSON.stringify({
          toDivisionId: Number(toDivisionId),
          reason: transferReason,
          transferDetails,
        }),
      }),
    onSuccess: async (res) => {
      if (res.ok) {
        setTransferOpen(false);
        setTransferReason("");
        setTransferDetails("");
        setToDivisionId("");
        setActionError("");
        queryClient.invalidateQueries({ queryKey: ["order", orderId] });
        queryClient.invalidateQueries({ queryKey: ["order-audit", orderId] });
        queryClient.invalidateQueries({ queryKey: ["orders"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        return;
      }
      const data = await res.json().catch(() => ({}));
      setActionError((data as { error?: string }).error || "Failed to transfer enquiry");
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
    onSuccess: async (res) => {
      if (res.ok) {
        setRejectOpen(false);
        setRejectReason("");
        setActionError("");
        queryClient.invalidateQueries({ queryKey: ["order", orderId] });
        queryClient.invalidateQueries({ queryKey: ["order-audit", orderId] });
        queryClient.invalidateQueries({ queryKey: ["orders"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        return;
      }
      const data = await res.json().catch(() => ({}));
      setActionError((data as { error?: string }).error || "Failed to reject enquiry");
    },
  });

  const slaHeadRejectionMutation = useMutation({
    mutationFn: () =>
      fetch(`/api/orders/${orderId}/sla-head-rejection`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message: slaHeadRejectionMessage }),
      }),
    onSuccess: async (res) => {
      if (res.ok) {
        setSlaHeadRejectionMessage("");
        setSlaHeadRejectionError("");
        queryClient.invalidateQueries({ queryKey: ["order", orderId] });
        queryClient.invalidateQueries({ queryKey: ["order-audit", orderId] });
        queryClient.invalidateQueries({ queryKey: ["sla"] });
        queryClient.invalidateQueries({ queryKey: ["md-overview"] });
        return;
      }
      const data = await res.json().catch(() => ({}));
      setSlaHeadRejectionError(
        (data as { error?: string }).error || "Failed to submit head rejection message"
      );
    },
  });
  const receiveMutation = useMutation({
    mutationFn: () =>
      fetch(`/api/orders/${orderId}/receive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reason: receiveReason }),
      }),
    onSuccess: async (res) => {
      if (res.ok) {
        setReceiveOpen(false);
        setReceiveReason("");
        setActionError("");
        queryClient.invalidateQueries({ queryKey: ["order", orderId] });
        queryClient.invalidateQueries({ queryKey: ["order-audit", orderId] });
        queryClient.invalidateQueries({ queryKey: ["orders"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        return;
      }
      const data = await res.json().catch(() => ({}));
      setActionError((data as { error?: string }).error || "Failed to mark enquiry received");
    },
  });

  const handoffMutation = useMutation({
    mutationFn: () =>
      fetch(`/api/orders/${orderId}/handoff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          supervisorId: Number(handoffSupervisorId),
          developmentKind: handoffDevKind,
          newDevelopmentDetails: handoffDevKind === "new" ? handoffNewDetails : undefined,
          existingProductDetails: handoffDevKind === "existing" ? handoffExistingDetails : undefined,
        }),
      }),
    onSuccess: async (res) => {
      if (res.ok) {
        setHandoffError("");
        setHandoffSupervisorId("");
        setHandoffNewDetails("");
        setHandoffExistingDetails("");
        queryClient.invalidateQueries({ queryKey: ["order", orderId] });
        queryClient.invalidateQueries({ queryKey: ["order-audit", orderId] });
        queryClient.invalidateQueries({ queryKey: ["orders"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["notifications-unread-count"] });
        return;
      }
      const data = await res.json().catch(() => ({}));
      setHandoffError((data as { error?: string }).error || "Could not submit assignment");
    },
  });
  const completeMutation = useMutation({
    mutationFn: () => fetch(`/api/orders/${orderId}/complete`, { method: "POST", credentials: "include" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order", orderId] });
      queryClient.invalidateQueries({ queryKey: ["order-audit", orderId] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (reason: string) => {
      const res = await fetch(`/api/orders/${orderId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof (data as { error?: string }).error === "string" ? (data as { error: string }).error : "Could not cancel enquiry");
      }
      return data;
    },
    onSuccess: () => {
      setCancelOpen(false);
      setCancelReason("");
      setCancelError("");
      queryClient.invalidateQueries({ queryKey: ["order", orderId] });
      queryClient.invalidateQueries({ queryKey: ["order-audit", orderId] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notifications-unread-count"] });
    },
    onError: (err: Error) => setCancelError(err.message),
  });

  const isManager = user && ["MANAGER", "SUPER_ADMIN"].includes(user.role);
  const status = order?.status;
  const hasStatus = typeof status === "string";
  const canAct = Boolean(order && isManager && hasStatus && ["PLACED", "TRANSFERRED", "IN_PROGRESS"].includes(status));
  /** Division-side reject — not shown to the person who raised the enquiry (they use Cancel enquiry instead). */
  const canRejectEnquiry =
    canAct && order && user && Number(user.id) !== order.createdById;
  const isClosedStatus = hasStatus && ["REJECTED", "COMPLETED", "CANCELLED"].includes(status);
  const mightManageSample =
    user &&
    order &&
    ["MANAGER", "SUPER_ADMIN", "MANAGING_DIRECTOR"].includes(user.role) &&
    !isClosedStatus;
  const assignedSupervisorMe =
    Boolean(user && order?.assignedSupervisorId && Number(user.id) === order.assignedSupervisorId);
  /** After head approves sample request, or legacy rows that already progressed sample workflow. */
  const legacySampleProgress = Boolean(
    order?.sampleApprovedAt ||
      order?.sampleDetails?.trim() ||
      order?.sampleQuantity?.trim() ||
      order?.sampleWeight?.trim()
  );
  const sampleGateOk = Boolean(
    !order?.sampleRequested ||
      order.headSampleRequestApprovedAt ||
      legacySampleProgress
  );
  const isEnquirySubmitter = Boolean(order && user && Number(user.id) === order.createdById);
  const canSeeSampleDetails =
    Boolean(user && ["SUPER_ADMIN", "MANAGING_DIRECTOR", "MANAGER"].includes(user.role)) ||
    assignedSupervisorMe ||
    (isEnquirySubmitter && Boolean(order?.sampleApprovedAt));
  const mightSubmitFeedback =
    user &&
    order &&
    !isClosedStatus &&
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
    onSuccess: (_data, variables) => {
      setSampleError("");
      const action = (variables as { action?: string }).action;
      if (action === "ship") {
        setSentByCourier(true);
        setCourierName("");
        setTrackingId("");
        setSampleProofFile(null);
      } else if (action === "salesFeedback") {
        setSalesFeedback("");
      } else if (action === "approve") {
        setApproveSampleOpen(false);
      } else if (action === "setDevelopment") {
        setNewDevOpen(false);
      }
      queryClient.invalidateQueries({ queryKey: ["order", orderId] });
      queryClient.invalidateQueries({ queryKey: ["order-audit", orderId] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: Error) => setSampleError(err.message),
  });

  useEffect(() => {
    if (!order?.sampleRequested) return;
    setSampleDetails(order.sampleDetails ?? "");
    setSampleQuantity(order.sampleQuantity ?? "");
    setSampleWeight(order.sampleWeight ?? "");
  }, [order?.id, order?.sampleDetails, order?.sampleQuantity, order?.sampleWeight, order?.sampleRequested]);

  useEffect(() => {
    if (!order?.sampleRequested) return;
    const cf = order.customFields;
    if (!cf || typeof cf !== "object") return;
    const sd = (cf as Record<string, unknown>).sampleDevelopment;
    if (!sd || typeof sd !== "object") return;
    const sdr = sd as Record<string, unknown>;
    const t = sdr.type;
    if (t === "existing") {
      setSampleDevType("existing");
      if (typeof sdr.existingReference === "string") setSampleExistingRef(sdr.existingReference);
    } else if (t === "new") {
      setSampleDevType("new");
      if (typeof sdr.whyNewDevelopment === "string") setNewDevWhy(sdr.whyNewDevelopment);
      if (typeof sdr.technicalDetails === "string") setNewDevTech(sdr.technicalDetails);
      if (typeof sdr.requestedDetailsToSubmit === "string") setNewDevRequestList(sdr.requestedDetailsToSubmit);
    }
  }, [order?.id, order?.customFields, order?.sampleRequested]);

  const openSlaBreach: OrderOpenSlaBreach | null =
    order?.slaBreaches && Array.isArray(order.slaBreaches) && order.slaBreaches.length
      ? (order.slaBreaches[0] as OrderOpenSlaBreach)
      : null;
  const isDivisionHead = Boolean(
    user &&
      order?.currentDivision?.managers &&
      Array.isArray(order.currentDivision.managers) &&
      order.currentDivision.managers.some((m: DivisionManagerWithUser) => Number(m.user?.id) === Number(user.id))
  );
  const awaitingHeadRejection = Boolean(openSlaBreach && !openSlaBreach.headRejectedAt);
  const canCancel =
    showInteractiveUi &&
    order &&
    order.status === "PLACED" &&
    user &&
    Number(user.id) === order.createdById;

  const hasSampleDetailsSaved =
    Boolean(order?.sampleDetails?.trim()) ||
    Boolean(order?.sampleQuantity?.trim()) ||
    Boolean(order?.sampleWeight?.trim());

  const sampleDevelopment = useMemo(() => {
    const cf = order?.customFields;
    if (!cf || typeof cf !== "object") return null;
    const sd = (cf as Record<string, unknown>).sampleDevelopment;
    if (!sd || typeof sd !== "object") return null;
    return sd as Record<string, unknown>;
  }, [order?.customFields]);

  const sampleDevelopmentUpdatedAtLabel = useMemo(() => {
    if (!sampleDevelopment) return "";
    const raw = sampleDevelopment.updatedAt;
    if (typeof raw !== "string" || !raw.trim()) return "";
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString();
  }, [sampleDevelopment]);

  const hasSampleDevelopmentSaved = useMemo(() => {
    if (!sampleDevelopment) return false;
    if (sampleDevelopment.type === "existing") {
      return typeof sampleDevelopment.existingReference === "string" && sampleDevelopment.existingReference.trim().length > 0;
    }
    if (sampleDevelopment.type === "new") {
      return (
        typeof sampleDevelopment.whyNewDevelopment === "string" &&
        sampleDevelopment.whyNewDevelopment.trim().length > 0 &&
        typeof sampleDevelopment.technicalDetails === "string" &&
        sampleDevelopment.technicalDetails.trim().length > 0
      );
    }
    return false;
  }, [sampleDevelopment]);

  const canApproveSampleNow = hasSampleDetailsSaved || hasSampleDevelopmentSaved;

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

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link
          href={backHref}
          className="inline-block text-sm text-slate-500 hover:text-slate-800 transition-colors"
        >
          {backLabel}
        </Link>
        <h1
          className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-2xl font-bold tracking-tight text-slate-900"
          aria-label={`${order.orderNumber ? formatEnquiryNumber(order.orderNumber) : "—"}, ${order.currentDivision?.name ?? "—"}, ${new Date(order.createdAt).toLocaleString()}, ${order.status.replace("_", " ")}`}
        >
          <span
            title={order.orderNumber ? formatEnquiryNumber(order.orderNumber) : "—"}
            className="rounded-md border-2 border-indigo-500/60 bg-indigo-50 px-2.5 py-1 font-mono text-lg text-indigo-950 shadow-sm ring-1 ring-indigo-200/80 sm:text-xl"
          >
            {order.orderNumber ? formatEnquiryNumberShort(order.orderNumber) : "—"}
          </span>
          <span className="font-normal text-slate-400" aria-hidden>
            →
          </span>
          <span className="font-semibold text-slate-800">
            {order.currentDivision?.name?.trim() ? order.currentDivision.name : "—"}
          </span>
          <span className="font-normal text-slate-400" aria-hidden>
            →
          </span>
          <time
            dateTime={order.createdAt}
            className={`font-semibold tabular-nums ${placedDateClass(order, clientClockMs)}`}
            suppressHydrationWarning
          >
            {new Date(order.createdAt).toLocaleString()}
          </time>
          <span className="font-normal text-slate-400" aria-hidden>
            →
          </span>
          <Badge variant={statusVariant[order.status] ?? "secondary"} className="text-xs font-semibold uppercase tracking-wide">
            {order.status.replace("_", " ")}
          </Badge>
        </h1>
      </header>

      <Card className="border-2 border-slate-400/50 shadow-md ring-1 ring-slate-200/60">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
          <CardTitle>Enquiry details</CardTitle>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {canAct && showInteractiveUi ? (
              <>
                {(order.status === "PLACED" || order.status === "TRANSFERRED") && (
                  <Button
                    size="sm"
                    onClick={() => {
                      setActionError("");
                      setAcceptOpen(true);
                    }}
                    disabled={acceptMutation.isPending || (order.status === "TRANSFERRED" && !order.receivedById)}
                  >
                    Accept
                  </Button>
                )}
                {order.status === "TRANSFERRED" && !order.receivedById && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setReceiveReason("");
                      setActionError("");
                      setReceiveOpen(true);
                    }}
                  >
                    Receive
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setActionError("");
                    setTransferOpen(true);
                  }}
                >
                  Transfer
                </Button>
                {canRejectEnquiry ? (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      setActionError("");
                      setRejectOpen(true);
                    }}
                  >
                    Reject
                  </Button>
                ) : null}
                {order.status === "IN_PROGRESS" ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => completeMutation.mutate()}
                    disabled={completeMutation.isPending}
                  >
                    Complete
                  </Button>
                ) : null}
              </>
            ) : null}
            {canCancel && (
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 text-destructive border-destructive/40 hover:bg-destructive/5"
                onClick={() => {
                  setCancelReason("");
                  setCancelError("");
                  setCancelOpen(true);
                }}
              >
                Cancel enquiry
              </Button>
            )}
          </div>
          {actionError ? (
            <p className="px-6 pb-3 pt-0 text-sm text-red-600 sm:px-6">{actionError}</p>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-0 overflow-hidden rounded-lg border-2 border-slate-300/60 bg-white shadow-inner">
          <div className="flex flex-col gap-1 border-b-2 border-indigo-300/70 bg-gradient-to-r from-indigo-50 to-violet-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-indigo-900">Enquiry number</span>
            <span className="font-mono text-base font-bold tracking-tight text-indigo-950 sm:text-lg">
              {order.orderNumber ? formatEnquiryNumber(order.orderNumber) : "—"}
            </span>
          </div>
          <div className="divide-y divide-slate-200">
          <p className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-baseline sm:gap-3">
            <span className="min-w-[10rem] shrink-0 text-sm font-medium text-slate-500">Company name</span>
            <span className="text-sm font-semibold text-slate-900">
            {order.companyName?.trim() ? order.companyName : "—"}
            </span>
          </p>
          <p className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-baseline sm:gap-3">
            <span className="min-w-[10rem] shrink-0 text-sm font-medium text-slate-500">Product description</span>
            <span className="text-sm font-semibold text-slate-900">
            {order.description?.trim() ? order.description : "—"}
            </span>
          </p>
          <p className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-baseline sm:gap-3">
            <span className="min-w-[10rem] shrink-0 text-sm font-medium text-slate-500">Created by</span>
            <span className="text-sm font-semibold text-slate-900">{order.createdBy?.name} ({order.createdBy?.email})</span>
          </p>
          {order.acceptanceReason?.trim() ? (
            <p className="flex flex-col gap-0.5 border-t border-slate-200 px-4 py-3 sm:flex-row sm:items-baseline sm:gap-3">
              <span className="min-w-[10rem] shrink-0 text-sm font-medium text-slate-500">Acceptance reason</span>
              <span className="text-sm text-slate-800 whitespace-pre-wrap">{order.acceptanceReason}</span>
            </p>
          ) : null}
          {order.receiveReason?.trim() ? (
            <p className="flex flex-col gap-0.5 border-t border-slate-200 px-4 py-3 sm:flex-row sm:items-baseline sm:gap-3">
              <span className="min-w-[10rem] shrink-0 text-sm font-medium text-slate-500">Receive reason</span>
              <span className="text-sm text-slate-800 whitespace-pre-wrap">{order.receiveReason}</span>
            </p>
          ) : null}
          {order.assignedSupervisor ? (
            <p className="flex flex-col gap-0.5 border-t border-slate-200 px-4 py-3 sm:flex-row sm:items-baseline sm:gap-3">
              <span className="min-w-[10rem] shrink-0 text-sm font-medium text-slate-500">Assigned supervisor</span>
              <span className="text-sm font-semibold text-slate-900">
                {order.assignedSupervisor.name} ({order.assignedSupervisor.email})
              </span>
            </p>
          ) : null}
          {order.enquiryHandoff && typeof order.enquiryHandoff === "object" ? (
            <div className="border-t border-slate-200 px-4 py-3 space-y-1 text-sm">
              <p className="font-medium text-slate-500">Development classification</p>
              <p className="text-slate-900">
                {order.enquiryHandoff.developmentKind === "existing" ? "Existing development" : "New development"}
              </p>
              {typeof order.enquiryHandoff.newDevelopmentDetails === "string" &&
              order.enquiryHandoff.newDevelopmentDetails.trim() ? (
                <p className="text-slate-800 whitespace-pre-wrap">{order.enquiryHandoff.newDevelopmentDetails}</p>
              ) : null}
              {typeof order.enquiryHandoff.existingProductDetails === "string" &&
              order.enquiryHandoff.existingProductDetails.trim() ? (
                <p className="text-slate-800 whitespace-pre-wrap">{order.enquiryHandoff.existingProductDetails}</p>
              ) : null}
            </div>
          ) : null}
          </div>
          {order.status === "CANCELLED" && order.cancellationReason ? (
            <div className="mx-4 mb-4 mt-3 rounded-lg border border-stone-200 bg-stone-50/90 p-3 text-sm">
              <p className="font-medium text-stone-900">This enquiry was cancelled</p>
              <p className="mt-1 text-stone-700">
                <span className="text-slate-500">Reason:</span> {order.cancellationReason}
              </p>
              {order.cancelledAt ? (
                <p className="mt-2 text-xs text-slate-500">
                  {order.cancelledBy?.name ? `${order.cancelledBy.name} · ` : ""}
                  {new Date(order.cancelledAt).toLocaleString()}
                </p>
              ) : null}
            </div>
          ) : null}
          <p className="flex flex-col gap-0.5 border-t border-slate-200 px-4 py-3 sm:flex-row sm:items-baseline sm:gap-3">
            <span className="min-w-[10rem] shrink-0 text-sm font-medium text-slate-500">Sample requested</span>
            <span className="text-sm font-semibold text-slate-900">
            {order.sampleRequested ? "Yes" : "No"}
            {order.sampleRequested && !order.sampleRequestNotes?.trim() ? " (no notes)" : null}
            </span>
          </p>
          {order.sampleRequested && order.sampleRequestNotes?.trim() ? (
            <p className="flex flex-col gap-0.5 border-t border-slate-200 px-4 py-3 sm:flex-row sm:items-baseline sm:gap-3">
              <span className="min-w-[10rem] shrink-0 text-sm font-medium text-slate-500">Sample request notes</span>
              <span className="text-sm font-semibold text-slate-900">{order.sampleRequestNotes}</span>
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
          {order.slaDeadline ? (
            <p className="flex flex-col gap-0.5 border-t border-slate-200 px-4 py-3 sm:flex-row sm:items-baseline sm:gap-3">
              <span className="min-w-[10rem] shrink-0 text-sm font-medium text-slate-500">SLA deadline</span>
              <time className="text-sm font-semibold text-slate-900" dateTime={order.slaDeadline} suppressHydrationWarning>
                {new Date(order.slaDeadline).toLocaleString()}
              </time>
            </p>
          ) : null}
          {openSlaBreach ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-sm">
              <p className="font-medium text-amber-950">SLA breach recorded</p>
              <p className="mt-1 text-xs text-amber-900/80">
                Breached at {new Date(openSlaBreach.breachedAt).toLocaleString()} · Division{" "}
                {openSlaBreach.division?.name ?? order.currentDivision?.name ?? "—"}
              </p>
              {openSlaBreach.headRejectedAt ? (
                <div className="mt-2 text-xs text-slate-700">
                  <p>
                    <span className="text-slate-500">Head rejection submitted:</span>{" "}
                    <span className="font-mono">{new Date(openSlaBreach.headRejectedAt).toLocaleString()}</span>
                    {openSlaBreach.headRejectedBy?.name ? (
                      <>
                        {" "}
                        by <span className="font-medium">{openSlaBreach.headRejectedBy.name}</span>
                      </>
                    ) : null}
                  </p>
                  {openSlaBreach.headRejectionMessage ? (
                    <p className="mt-1 whitespace-pre-wrap">{openSlaBreach.headRejectionMessage}</p>
                  ) : null}
                </div>
              ) : (
                <p className="mt-2 text-xs font-medium text-amber-800">
                  Awaiting Division Head rejection message. Actions are blocked until this is submitted.
                </p>
              )}

              {showInteractiveUi && awaitingHeadRejection && isDivisionHead && user?.role === "MANAGER" ? (
                <div className="mt-3 space-y-2">
                  <Label className="text-xs uppercase tracking-wide text-amber-900/70">
                    Division Head rejection message (delay / breach)
                  </Label>
                  <textarea
                    value={slaHeadRejectionMessage}
                    onChange={(e) => setSlaHeadRejectionMessage(e.target.value)}
                    className="w-full min-h-[90px] rounded-md border border-amber-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                    placeholder="Explain the reason for the delay / breach and the decision."
                  />
                  {slaHeadRejectionError ? (
                    <p className="text-xs text-red-700">{slaHeadRejectionError}</p>
                  ) : null}
                  <Button
                    type="button"
                    disabled={slaHeadRejectionMutation.isPending || !slaHeadRejectionMessage.trim()}
                    onClick={() => slaHeadRejectionMutation.mutate()}
                  >
                    Submit rejection message
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
          {!isAuditView ? (
            <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-t border-slate-200 px-4 py-3 text-sm">
              <span className="font-medium text-slate-500">Transfers</span>
              <span className="font-semibold tabular-nums text-slate-900">{order.transferCount}</span>
              <span className="text-slate-300" aria-hidden>
                ·
              </span>
              <span className="font-medium text-slate-500">
                {isEnquirySubmitter ? "Declined by division" : "Rejections"}
              </span>
              <span className="font-semibold tabular-nums text-slate-900">{order.rejectionCount}</span>
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
              {(order.transfers?.length ?? 0) > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
                    Transfer history ({order.transfers?.length ?? 0})
                  </p>
                  <ul className="space-y-3 list-none pl-0">
                    {(order.transfers ?? []).map((t, idx) => {
                      const heads =
                        t.toDivision?.managers
                          ?.map((m) => `${m.user?.name ?? "—"} (${m.user?.email ?? "—"})`)
                          .join(", ") || "No division heads assigned";
                      return (
                        <li key={t.id ?? `${t.createdAt}-${idx}`} className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                          <p className="font-medium text-slate-900">
                            {t.fromDivision?.name ?? "—"} → {t.toDivision?.name ?? "—"}
                          </p>
                          <p className="mt-1 text-slate-600">
                            <span className="text-slate-500">Transferred by:</span> {t.transferredBy?.name ?? "—"} (
                            {t.transferredBy?.email ?? "—"})
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
                    })}
                  </ul>
                </div>
              )}
              {(order.rejections?.length ?? 0) > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
                    Rejection events ({order.rejections?.length ?? 0})
                  </p>
                  <ul className="space-y-2 list-none pl-0">
                    {(order.rejections ?? []).map((r, idx) => (
                      <li key={r.id ?? `${r.createdAt}-${idx}`} className="rounded-lg border border-red-100 bg-red-50/40 p-3">
                        <p className="text-slate-900">
                          <span className="text-slate-500">Rejected by:</span> {r.rejectedBy?.name ?? "—"} (
                          {r.rejectedBy?.email ?? "—"})
                        </p>
                        <p className="text-slate-600">
                          <span className="text-slate-500">Division:</span> {r.division?.name ?? "—"}
                        </p>
                        <p className="text-slate-500 text-xs mt-1">{new Date(r.createdAt).toLocaleString()}</p>
                        {r.reason?.trim() ? <p className="mt-2 text-slate-800">{r.reason}</p> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {!isAuditView && needsHandoff ? (
        <Card>
          <CardHeader>
            <CardTitle>Assign supervisor &amp; development</CardTitle>
            <p className="text-sm text-slate-500 font-normal">
              Choose an ASM / supervisor from this division only, then classify the enquiry as new or existing
              development. The supervisor receives an email with the enquiry summary.
            </p>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {divisionSupervisors.length === 0 ? (
              <p className="text-amber-800">
                No active supervisors are linked to this division. Ask an admin to assign SUPERVISOR users to{" "}
                <span className="font-medium">{order.currentDivision?.name ?? "this division"}</span>.
              </p>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Supervisor (this division only)</Label>
                  <Select value={handoffSupervisorId} onValueChange={setHandoffSupervisorId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select supervisor" />
                    </SelectTrigger>
                    <SelectContent>
                      {divisionSupervisors.map((s) => (
                        <SelectItem key={s.id} value={String(s.id)}>
                          {s.name} ({s.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Development type</Label>
                  <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-2 text-slate-800">
                      <input
                        type="radio"
                        name="handoff-dev"
                        checked={handoffDevKind === "new"}
                        onChange={() => setHandoffDevKind("new")}
                      />
                      New development
                    </label>
                    <label className="flex items-center gap-2 text-slate-800">
                      <input
                        type="radio"
                        name="handoff-dev"
                        checked={handoffDevKind === "existing"}
                        onChange={() => setHandoffDevKind("existing")}
                      />
                      Existing development
                    </label>
                  </div>
                </div>
                {handoffDevKind === "new" ? (
                  <div className="space-y-2">
                    <Label>New development details (min 10 characters)</Label>
                    <textarea
                      value={handoffNewDetails}
                      onChange={(e) => setHandoffNewDetails(e.target.value)}
                      rows={4}
                      className="flex min-h-[96px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs"
                      placeholder="Reason and technical / scope details for new development"
                    />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label>Existing product / reference details (min 10 characters)</Label>
                    <textarea
                      value={handoffExistingDetails}
                      onChange={(e) => setHandoffExistingDetails(e.target.value)}
                      rows={4}
                      className="flex min-h-[96px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs"
                      placeholder="What was manufactured before (style code, prior enquiry, specs…)"
                    />
                  </div>
                )}
                {handoffError ? <p className="text-sm text-red-600">{handoffError}</p> : null}
                <Button
                  type="button"
                  disabled={
                    handoffMutation.isPending ||
                    !handoffSupervisorId ||
                    (handoffDevKind === "new" ? handoffNewDetails.trim().length < 10 : handoffExistingDetails.trim().length < 10)
                  }
                  onClick={() => {
                    setHandoffError("");
                    handoffMutation.mutate();
                  }}
                >
                  {handoffMutation.isPending ? "Submitting…" : "Submit assignment"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      ) : null}

      {!isAuditView && userMayViewEnquiryExecInsights(user?.role) && (
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
              {auditQueryError ? (
                <p className="text-sm text-red-600">Could not load activity log.</p>
              ) : auditLoading && auditLogsAsc.length === 0 ? (
                <p className="text-sm text-slate-500">Loading activity…</p>
              ) : auditLogsAsc.length ? (
                <div className="relative">
                  <div
                    className="pointer-events-none absolute left-[7px] top-3 bottom-3 w-px bg-linear-to-b from-slate-300/90 via-slate-200/60 to-transparent sm:left-[9px]"
                    aria-hidden
                  />
                  <ul className="relative space-y-4">
                    {(
                      auditLogsAsc as {
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

      {isAuditView && userMayViewEnquiryExecInsights(user?.role) && (
        <Card>
          <CardHeader>
            <CardTitle>Activity timeline</CardTitle>
            <p className="text-sm text-slate-500 font-normal">
              Chronological audit log for this enquiry (newest events appear at the bottom).
            </p>
          </CardHeader>
          <CardContent>
            {auditQueryError ? (
              <p className="text-sm text-red-600">Could not load activity log.</p>
            ) : auditLoading && auditLogsAsc.length === 0 ? (
              <p className="text-sm text-slate-500">Loading timeline…</p>
            ) : auditLogsAsc.length === 0 ? (
              <p className="text-sm text-slate-500">No audit entries recorded.</p>
            ) : (
              <ul className="space-y-3">
                {auditLogsAsc.map((log) => {
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
              First submit and save sample details. After they are saved, approve the sample in a separate step.
              Shipment requires courier and tracking ID. Sales can add feedback anytime before rejection.
            </p>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {sampleDevelopment && (
              <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-slate-900">Sample type</p>
                  {sampleDevelopmentUpdatedAtLabel ? (
                    <span className="text-xs text-slate-500">Updated: {sampleDevelopmentUpdatedAtLabel}</span>
                  ) : null}
                </div>

                {sampleDevelopment.type === "existing" ? (
                  <div className="space-y-2">
                    {typeof sampleDevelopment.existingReference === "string" ? (
                      <p className="text-slate-700">
                        <span className="text-slate-500">Existing sample (previous):</span>{" "}
                        {sampleDevelopment.existingReference}
                      </p>
                    ) : (
                      <p className="text-slate-600">—</p>
                    )}
                  </div>
                ) : sampleDevelopment.type === "new" ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-slate-700">
                      <span className="text-slate-500">New development:</span> submitted
                    </p>
                    <Button type="button" size="sm" variant="outline" onClick={() => setNewDevViewOpen(true)}>
                      View details…
                    </Button>
                  </div>
                ) : (
                  <p className="text-slate-600">—</p>
                )}
              </div>
            )}
            {canSeeSampleDetails && (order.sampleDetails || order.sampleQuantity || order.sampleWeight) && (
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
            {!canSeeSampleDetails && (order.sampleDetails || order.sampleQuantity || order.sampleWeight) ? (
              <p className="rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2 text-slate-600">
                Sample details are pending head approval. They will appear here after the head approves.
              </p>
            ) : null}
            {order.headSampleRequestApprovedAt ? (
              <p className="text-slate-700">
                <span className="text-slate-500">Sample request approved by head</span>{" "}
                {new Date(order.headSampleRequestApprovedAt).toLocaleString()}
                {order.headSampleRequestApprovedBy?.name ? ` · ${order.headSampleRequestApprovedBy.name}` : ""}
              </p>
            ) : order.sampleRequested && !legacySampleProgress ? (
              <p className="rounded-lg border border-amber-100 bg-amber-50/80 px-3 py-2 text-amber-950">
                Awaiting division head approval of the sample request before supervisors can enter sample details.
              </p>
            ) : null}
            {order.sampleApprovedAt && (
              <p className="text-slate-700">
                <span className="text-slate-500">Sample workflow approved</span>{" "}
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
              <div className="space-y-6 border-t border-slate-100 pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Division actions</p>
                {order.sampleRequested &&
                !order.headSampleRequestApprovedAt &&
                mightManageSample &&
                order.enquiryHandoff ? (
                  <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 space-y-2">
                    <p className="text-sm font-medium text-slate-900">Approve sample request</p>
                    <p className="text-xs text-slate-600">
                      Sales requested a sample. Approve so the assigned supervisor can submit sample specifications.
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      disabled={sampleMutation.isPending}
                      onClick={() => sampleMutation.mutate({ action: "approveSampleRequest" })}
                    >
                      Approve sample request
                    </Button>
                  </div>
                ) : null}
                {order.sampleRequested &&
                !order.headSampleRequestApprovedAt &&
                user?.role === "SUPERVISOR" &&
                assignedSupervisorMe ? (
                  <p className="text-sm text-slate-600">
                    The division head must approve the sample request before you can enter sample details.
                  </p>
                ) : null}
                {sampleGateOk && !order.sampleApprovedAt && assignedSupervisorMe && user?.role === "SUPERVISOR" && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3">
                    <p className="text-sm font-medium text-slate-900">Step 1 — Submit sample details</p>
                    <p className="text-xs text-slate-500">
                      Enter details and click Save. Approval is only available after details are saved.
                    </p>
                    {(assignedSupervisorMe || (isManager && sampleGateOk)) && (
                    <div className="space-y-2">
                      <Label htmlFor="sample-details">Sample details</Label>
                      <textarea
                        id="sample-details"
                        value={sampleDetails}
                        onChange={(e) => setSampleDetails(e.target.value)}
                        placeholder="Sample specifications, color, finish…"
                        rows={2}
                        className="flex min-h-[56px] w-full rounded-md border border-slate-200 px-3 py-2 text-sm bg-white"
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
                        variant="default"
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
                  </div>
                )}
                {sampleGateOk && !order.sampleApprovedAt && mightManageSample && !assignedSupervisorMe && (
                  <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                    <p className="text-sm font-medium text-slate-900">Approve sample details</p>
                    {!canApproveSampleNow ? (
                      <p className="text-sm text-slate-500">
                        Wait for the supervisor to submit sample details first. Once submitted, you can approve here.
                      </p>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={sampleMutation.isPending}
                        onClick={() => setApproveSampleOpen(true)}
                      >
                        Approve sample…
                      </Button>
                    )}
                  </div>
                )}
                {sampleGateOk && order.sampleApprovedAt && !order.sampleShippedAt && (
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

      {(order.editHistory?.length ?? 0) > 0 && (
        <Card>
          <CardHeader><CardTitle>Edit history</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {(order.editHistory ?? []).map((h) => (
                <li key={h.id} className="rounded border border-slate-100 p-2">
                  <span className="font-medium">{h.fieldName}</span>: &quot;{h.oldValue ?? "—"}&quot; → &quot;{h.newValue ?? "—"}&quot;
                  <span className="text-slate-500 ml-2">by {h.user.name} at {new Date(h.createdAt).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {!isAuditView && (order.transfers?.length ?? 0) > 0 && (
        <Card>
          <CardHeader><CardTitle>Transfers</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {(order.transfers ?? []).map((t, idx) => (
                <li key={t.id ?? `${t.createdAt}-${idx}`} className="text-sm">
                  {t.fromDivision?.name ?? "—"} → {t.toDivision?.name ?? "—"} by {t.transferredBy?.name ?? "—"}:{" "}
                  {t.reason ?? "—"}
                  {t.transferDetails?.trim() ? (
                    <span className="block text-slate-600 mt-1">Details: {t.transferDetails}</span>
                  ) : null}{" "}
                  ({new Date(t.createdAt).toLocaleString()})
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {!isAuditView && (order.rejections?.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{isEnquirySubmitter ? "Division did not proceed" : "Rejections"}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {(order.rejections ?? []).map((r, idx) => (
                <li key={r.id ?? `${r.createdAt}-${idx}`} className="text-sm">
                  {r.division?.name ?? "—"}: {r.reason ?? "—"} — {r.rejectedBy?.name ?? "—"} (
                  {new Date(r.createdAt).toLocaleString()})
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Dialog
        open={transferOpen}
        onOpenChange={(open) => {
          setTransferOpen(open);
          if (!open) {
            setTransferDetails("");
            setTransferReason("");
            setToDivisionId("");
          }
        }}
      >
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
                placeholder="Why this enquiry is being transferred"
                rows={4}
                className="flex min-h-[96px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label>Transfer details (min 10 characters)</Label>
              <textarea
                value={transferDetails}
                onChange={(e) => setTransferDetails(e.target.value)}
                placeholder="Target division contact, context, handover notes"
                rows={4}
                className="flex min-h-[96px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferOpen(false)}>Cancel</Button>
            <Button
              onClick={() => transferMutation.mutate()}
              disabled={
                !toDivisionId ||
                transferReason.trim().length < 10 ||
                transferDetails.trim().length < 10 ||
                transferMutation.isPending
              }
            >
              Transfer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={receiveOpen}
        onOpenChange={(open) => {
          setReceiveOpen(open);
          if (!open) setReceiveReason("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Receive enquiry</DialogTitle>
            <DialogDescription>
              Confirm this enquiry has entered your division after transfer. A reason is required.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Reason (min 10 characters)</Label>
              <textarea
                value={receiveReason}
                onChange={(e) => setReceiveReason(e.target.value)}
                placeholder="Brief notes on receiving this enquiry in your division"
                rows={4}
                className="flex min-h-[96px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiveOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => receiveMutation.mutate()}
              disabled={receiveReason.trim().length < 10 || receiveMutation.isPending}
            >
              Confirm receive
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

      <Dialog open={approveSampleOpen} onOpenChange={setApproveSampleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve sample</DialogTitle>
            <DialogDescription>
              This confirms the saved sample details and allows shipment to be recorded next. This step is separate
              from saving details.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setApproveSampleOpen(false)}>
              Back
            </Button>
            <Button
              type="button"
              disabled={sampleMutation.isPending}
              onClick={() => sampleMutation.mutate({ action: "approve" })}
            >
              {sampleMutation.isPending ? "Approving…" : "Confirm approval"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={newDevOpen}
        onOpenChange={(open) => {
          setNewDevOpen(open);
          if (!open) {
            // leave values for convenience
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New development details</DialogTitle>
            <DialogDescription>
              Explain why this is new development and what technical information is required. This is visible in the
              workflow and used for approvals.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Why new development? (technical justification)</Label>
              <textarea
                value={newDevWhy}
                onChange={(e) => setNewDevWhy(e.target.value)}
                placeholder="Why can’t we use an existing sample? What is different/new?"
                rows={3}
                className="flex min-h-[84px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label>Technical details / development process</Label>
              <textarea
                value={newDevTech}
                onChange={(e) => setNewDevTech(e.target.value)}
                placeholder="Materials/spec, construction, tolerances, test requirements, risks, timeline, etc."
                rows={4}
                className="flex min-h-[110px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label>Details the team must submit</Label>
              <textarea
                value={newDevRequestList}
                onChange={(e) => setNewDevRequestList(e.target.value)}
                placeholder="e.g. target shade, finish, reference standards, lab dips, GSM, MOQ, lead time…"
                rows={3}
                className="flex min-h-[84px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setNewDevOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={
                sampleMutation.isPending ||
                newDevWhy.trim().length < 20 ||
                newDevTech.trim().length < 20 ||
                newDevRequestList.trim().length < 10
              }
              onClick={() =>
                sampleMutation.mutate({
                  action: "setDevelopment",
                  developmentType: "new",
                  whyNewDevelopment: newDevWhy.trim(),
                  technicalDetails: newDevTech.trim(),
                  requestedDetailsToSubmit: newDevRequestList.trim(),
                })
              }
            >
              Submit new development details
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {order?.id ? (
        <EnquiryTimeline enquiryId={Number(order.id)} />
      ) : null}

      <Dialog open={newDevViewOpen} onOpenChange={setNewDevViewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New development details</DialogTitle>
            <DialogDescription>
              {sampleDevelopmentUpdatedAtLabel ? `Submitted / updated: ${sampleDevelopmentUpdatedAtLabel}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 text-sm">
            <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Why new development</p>
              <p className="whitespace-pre-wrap text-slate-800">
                {typeof sampleDevelopment?.whyNewDevelopment === "string"
                  ? sampleDevelopment.whyNewDevelopment
                  : "—"}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Technical details</p>
              <p className="whitespace-pre-wrap text-slate-800">
                {typeof sampleDevelopment?.technicalDetails === "string"
                  ? sampleDevelopment.technicalDetails
                  : "—"}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Details to submit</p>
              <p className="whitespace-pre-wrap text-slate-800">
                {typeof sampleDevelopment?.requestedDetailsToSubmit === "string"
                  ? sampleDevelopment.requestedDetailsToSubmit
                  : "—"}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setNewDevViewOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={cancelOpen}
        onOpenChange={(open) => {
          setCancelOpen(open);
          if (!open) setCancelError("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this enquiry</DialogTitle>
            <p className="text-sm font-normal text-slate-600 pt-1">
              Division heads will be notified with the reason you provide. This cannot be undone.
            </p>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Reason (min 10 characters)</Label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Explain why you are withdrawing this enquiry"
                rows={4}
                className="flex min-h-[96px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
              />
            </div>
            {cancelError ? <p className="text-sm text-destructive">{cancelError}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>
              Back
            </Button>
            <Button
              variant="destructive"
              onClick={() => cancelMutation.mutate(cancelReason.trim())}
              disabled={cancelReason.trim().length < 10 || cancelMutation.isPending}
            >
              {cancelMutation.isPending ? "Cancelling…" : "Confirm cancellation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
