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
import { useState, useMemo, useEffect, useRef } from "react";
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

/** Values from `<input type="date" />` (YYYY-MM-DD). Noon avoids DST off-by-one when formatting. */
function parsePlanDate(isoDay: string): Date | null {
  const t = isoDay.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const d = new Date(`${t}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatStoredPlanDate(value: string): string {
  const d = parsePlanDate(value);
  if (!d) return value;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** Full planning payload: prefer dedicated column, fall back to snapshot stored on `enquiryHandoff` (survives schema drift). */
function getEffectiveNewDevPlan(order: {
  enquiryHandoff?: Record<string, unknown> | null;
  newDevPlan?: Record<string, unknown> | null;
}): Record<string, unknown> | null {
  if (order.newDevPlan && typeof order.newDevPlan === "object") {
    return order.newDevPlan as Record<string, unknown>;
  }
  const h = order.enquiryHandoff;
  if (h && h.developmentKind === "new" && h.planning && typeof h.planning === "object") {
    return h.planning as Record<string, unknown>;
  }
  return null;
}

/** Ask browser extensions (e.g. Grammarly) not to inject into our fields — avoids DOM/React sync issues. */
const noGrammarlyTextarea = {
  "data-gramm": "false",
  "data-gramm_editor": "false",
  "data-enable-grammarly": "false",
} as const;

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
  newDevPlan?: Record<string, unknown> | null;
  headSampleRequestApprovedAt?: string | null;
  assignedSupervisor?: { id: number; name: string; email: string } | null;
  headSampleRequestApprovedBy?: { name?: string | null; email?: string | null } | null;
  sampleSpecsAcknowledgedAt?: string | null;
  sampleSpecsAcknowledgedBy?: { name?: string | null; email?: string | null } | null;
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
  // Customer identity fields
  customerId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  customerAddress?: string | null;
  gstNumber?: string | null;
  gstCopyUrl?: string | null;
  customerOrderDate?: string | null;
  // Customer feedback extension fields
  customerFeedback?: string | null;
  customerFeedbackAt?: string | null;
  customerResponseStatus?: string | null;
  customerFeedbackRemarks?: string | null;
  sampleReceivedAt?: string | null;
  // Sample extension fields
  sampleDeliveryDate?: string | null;
  sampleRemarks?: string | null;
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
            ? "bg-red-50 text-red-700 border-red-200 ring-1 ring-red-100"
            : s.done
              ? "bg-emerald-50 text-emerald-700 border-emerald-200 ring-1 ring-emerald-100"
              : "bg-white text-slate-400 border-slate-200";
        return (
          <span
            key={s.label}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-all ${doneClass}`}
          >
            {s.done && s.label !== "Rejected" ? (
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />
            ) : s.label === "Rejected" && s.done ? (
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" aria-hidden />
            ) : null}
            {s.label}
          </span>
        );
      })}
    </div>
  );
}


function parseGstCopy(value: string | null | undefined): { url: string; name: string } | null {
  if (!value) return null;
  try {
    const p = JSON.parse(value);
    if (p?.url) return { url: p.url, name: p.name ?? "GST certificate" };
  } catch { /* legacy: plain URL */ }
  return { url: value, name: "GST certificate" };
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
  // New development planning dialog
  const [newDevDialogOpen, setNewDevDialogOpen] = useState(false);
  const [newDevDescription, setNewDevDescription] = useState("");
  const [newDevResources, setNewDevResources] = useState("");
  const [newDevResearch, setNewDevResearch] = useState("");
  const [newDevPlanningNotes, setNewDevPlanningNotes] = useState("");
  const [newDevTimeline, setNewDevTimeline] = useState("");
  const [newDevCompletionDuration, setNewDevCompletionDuration] = useState("");
  const [newDevInternalNotes, setNewDevInternalNotes] = useState("");
  const [newDevReason, setNewDevReason] = useState("");
  const [newDevDialogError, setNewDevDialogError] = useState("");
  const [pendingNewDevPlan, setPendingNewDevPlan] = useState<Record<string, string | undefined> | null>(null);
  const [isEditingDevPlan, setIsEditingDevPlan] = useState(false);
  const [editDevPlanSaving, setEditDevPlanSaving] = useState(false);
  const handoffPrefilledForOrderRef = useRef<number | null>(null);
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
  const [feedbackResponseStatus, setFeedbackResponseStatus] = useState("");
  const [feedbackRemarks, setFeedbackRemarks] = useState("");
  const [feedbackReceivedDate, setFeedbackReceivedDate] = useState("");
  const [sampleError, setSampleError] = useState("");

  // Salesperson edit state
  const [editingEnquiry, setEditingEnquiry] = useState(false);
  const [editCustomerName, setEditCustomerName] = useState("");
  const [editCustomerPhone, setEditCustomerPhone] = useState("");
  const [editCustomerEmail, setEditCustomerEmail] = useState("");
  const [editCustomerAddress, setEditCustomerAddress] = useState("");
  const [editGstNumber, setEditGstNumber] = useState("");
  const [editGstCopyUrl, setEditGstCopyUrl] = useState("");
  const [editGstFileName, setEditGstFileName] = useState("");
  const [editGstUploading, setEditGstUploading] = useState(false);
  const [editGstUploadError, setEditGstUploadError] = useState("");
  const editGstFileRef = useRef<HTMLInputElement>(null);
  const [editCompanyName, setEditCompanyName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCustomerOrderDate, setEditCustomerOrderDate] = useState("");
  const [editEnquiryError, setEditEnquiryError] = useState("");
  const [editEnquirySaving, setEditEnquirySaving] = useState(false);

  // Supervisor sample edit state
  const [editingSample, setEditingSample] = useState(false);
  const [editSampleDetails, setEditSampleDetails] = useState("");
  const [editSampleQuantity, setEditSampleQuantity] = useState("");
  const [editSampleWeight, setEditSampleWeight] = useState("");
  const [editSampleRemarks, setEditSampleRemarks] = useState("");
  const [editSampleDeliveryDate, setEditSampleDeliveryDate] = useState("");
  const [editCourierName, setEditCourierName] = useState("");
  const [editTrackingId, setEditTrackingId] = useState("");
  const [editSampleByCourier, setEditSampleByCourier] = useState(true);
  const [editSampleError, setEditSampleError] = useState("");
  const [editSampleSaving, setEditSampleSaving] = useState(false);
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
    enabled: Boolean(
      user && ["MANAGER", "DIVISION_HEAD", "SUPER_ADMIN"].includes(user.role) && showInteractiveUi
    ),
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
        (user.role === "MANAGER" || user.role === "DIVISION_HEAD" || user.role === "SUPER_ADMIN" || user.role === "MANAGING_DIRECTOR")
    );

  const isDivisionHead = useMemo(
    () =>
      Boolean(
        user &&
          order?.currentDivision?.managers &&
          Array.isArray(order.currentDivision.managers) &&
          order.currentDivision.managers.some((m: DivisionManagerWithUser) => Number(m.user?.id) === Number(user.id))
      ),
    [user, order?.currentDivision?.managers, order?.id]
  );

  const mayManageHandoffReassign = Boolean(
    user && (isDivisionHead || ["SUPER_ADMIN", "MANAGING_DIRECTOR"].includes(user.role))
  );
  const canReassignHandoff = Boolean(
    showInteractiveUi &&
      user &&
      order &&
      order.status === "IN_PROGRESS" &&
      order.enquiryHandoff &&
      !order.sampleShippedAt &&
      (user.role === "MANAGER" ||
        user.role === "DIVISION_HEAD" ||
        user.role === "SUPER_ADMIN" ||
        user.role === "MANAGING_DIRECTOR") &&
      mayManageHandoffReassign
  );
  const showHandoffCard = needsHandoff || canReassignHandoff;

  // Auto-open planning dialog when "New development" is selected and handoff is needed (include needsHandoff so it runs after order load).
  useEffect(() => {
    if (handoffDevKind === "new" && needsHandoff && !pendingNewDevPlan) {
      setNewDevDialogOpen(true);
    }
  }, [handoffDevKind, needsHandoff, pendingNewDevPlan]);

  const { data: supervisorsData } = useQuery({
    queryKey: ["order-supervisors", orderId],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${orderId}/supervisors`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load supervisors");
      return res.json() as Promise<{ supervisors: { id: number; name: string; email: string }[] }>;
    },
    enabled: Boolean(Number.isInteger(orderId) && showHandoffCard),
    staleTime: 60_000,
  });
  const divisionSupervisors = supervisorsData?.supervisors ?? [];

  useEffect(() => {
    if (!order?.id) return;
    if (!canReassignHandoff) {
      if (handoffPrefilledForOrderRef.current === order.id) handoffPrefilledForOrderRef.current = null;
      return;
    }
    if (handoffPrefilledForOrderRef.current === order.id) return;
    handoffPrefilledForOrderRef.current = order.id;
    const supId = order.assignedSupervisorId;
    setHandoffSupervisorId(supId != null ? String(supId) : "");
    const h = order.enquiryHandoff as Record<string, unknown>;
    if (h.developmentKind === "existing") {
      setHandoffDevKind("existing");
      setHandoffExistingDetails(typeof h.existingProductDetails === "string" ? h.existingProductDetails : "");
      setPendingNewDevPlan(null);
    } else if (h.developmentKind === "new") {
      setHandoffDevKind("new");
      const plan = getEffectiveNewDevPlan(order);
      if (plan) {
        setPendingNewDevPlan({
          description: typeof plan.description === "string" ? plan.description : "",
          resourcesRequired: typeof plan.resourcesRequired === "string" ? plan.resourcesRequired : "",
          researchRequirements:
            typeof plan.researchRequirements === "string" && plan.researchRequirements.trim()
              ? (plan.researchRequirements as string)
              : undefined,
          planningNotes:
            typeof plan.planningNotes === "string" && plan.planningNotes.trim()
              ? (plan.planningNotes as string)
              : undefined,
          estimatedTimeline: typeof plan.estimatedTimeline === "string" ? plan.estimatedTimeline : "",
          expectedCompletionDuration:
            typeof plan.expectedCompletionDuration === "string" ? plan.expectedCompletionDuration : "",
          internalNotes:
            typeof plan.internalNotes === "string" && plan.internalNotes.trim()
              ? (plan.internalNotes as string)
              : undefined,
          reasonForNewDevelopment:
            typeof plan.reasonForNewDevelopment === "string" ? plan.reasonForNewDevelopment : "",
        });
      }
    }
  }, [canReassignHandoff, order?.id, order?.enquiryHandoff, order?.assignedSupervisorId, order?.newDevPlan]);

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
          newDevelopmentDetails: handoffDevKind === "new" ? pendingNewDevPlan?.description : undefined,
          existingProductDetails: handoffDevKind === "existing" ? handoffExistingDetails : undefined,
          newDevPlan: handoffDevKind === "new" ? pendingNewDevPlan : undefined,
        }),
      }),
    onSuccess: async (res) => {
      if (res.ok) {
        setHandoffError("");
        setHandoffSupervisorId("");
        setHandoffNewDetails("");
        setHandoffExistingDetails("");
        setPendingNewDevPlan(null);
        setNewDevDescription(""); setNewDevResources(""); setNewDevResearch("");
        setNewDevPlanningNotes(""); setNewDevTimeline(""); setNewDevCompletionDuration("");
        setNewDevInternalNotes(""); setNewDevReason("");
        handoffPrefilledForOrderRef.current = null;
        queryClient.invalidateQueries({ queryKey: ["order", orderId] });
        queryClient.invalidateQueries({ queryKey: ["order-audit", orderId] });
        queryClient.invalidateQueries({ queryKey: ["orders"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["notifications-unread-count"] });
        return;
      }
      const data = await res.json().catch(() => ({}));
      let msg = (data as { error?: string }).error || "Could not submit assignment";
      const details = (data as { details?: { fieldErrors?: Record<string, string[] | string[][]> } }).details;
      const fe = details?.fieldErrors;
      if (fe && typeof fe === "object") {
        const first = Object.values(fe).flat().find((x) => typeof x === "string" && x.length);
        if (typeof first === "string") msg = `${msg}: ${first}`;
      }
      setHandoffError(msg);
    },
  });
  const completeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/orders/${orderId}/complete`, { method: "POST", credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof (data as { error?: string }).error === "string"
            ? (data as { error: string }).error
            : "Could not complete enquiry"
        );
      }
      return data;
    },
    onSuccess: () => {
      setActionError("");
      queryClient.invalidateQueries({ queryKey: ["order", orderId] });
      queryClient.invalidateQueries({ queryKey: ["order-audit", orderId] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: Error) => setActionError(err.message),
  });

  const acknowledgeSpecsMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/orders/${orderId}/acknowledge-sample-specs`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof (data as { error?: string }).error === "string"
            ? (data as { error: string }).error
            : "Could not record confirmation"
        );
      }
      return data;
    },
    onSuccess: () => {
      setSampleError("");
      queryClient.invalidateQueries({ queryKey: ["order", orderId] });
      queryClient.invalidateQueries({ queryKey: ["enquiry-timeline", orderId] });
      queryClient.invalidateQueries({ queryKey: ["order-audit", orderId] });
    },
    onError: (err: Error) => setSampleError(err.message),
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

  const status = order?.status;
  const hasStatus = typeof status === "string";
  const isDivisionReviewerRole = Boolean(
    user && ["MANAGER", "DIVISION_HEAD", "SUPER_ADMIN", "MANAGING_DIRECTOR"].includes(user.role)
  );
  // MD is view-only — no Accept / Transfer / Reject / Complete actions
  const canAct = Boolean(
    order && isDivisionReviewerRole && hasStatus && ["PLACED", "TRANSFERRED", "IN_PROGRESS"].includes(status) &&
    user?.role !== "MANAGING_DIRECTOR"
  );
  /** Division-side reject — not shown to the person who raised the enquiry (they use Cancel enquiry instead). */
  const canRejectEnquiry =
    canAct && order && user && Number(user.id) !== order.createdById;
  const isClosedStatus = hasStatus && ["REJECTED", "COMPLETED", "CANCELLED"].includes(status);
  const mightManageSample =
    user &&
    order &&
    ["MANAGER", "DIVISION_HEAD", "SUPER_ADMIN", "MANAGING_DIRECTOR"].includes(user.role) &&
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
  /** Matches `approveHeadSampleRequest` in order-engine: handoff or legacy sample work must exist first. */
  const sampleRequestApprovalPrereqMet =
    Boolean(order?.enquiryHandoff) || legacySampleProgress;
  const sampleGateOk = Boolean(
    !order?.sampleRequested ||
      order.headSampleRequestApprovedAt ||
      legacySampleProgress
  );
  const isEnquirySubmitter = Boolean(order && user && Number(user.id) === order.createdById);
  const canSeeSampleDetails =
    Boolean(user && ["SUPER_ADMIN", "MANAGING_DIRECTOR", "MANAGER", "DIVISION_HEAD"].includes(user.role)) ||
    assignedSupervisorMe ||
    (isEnquirySubmitter && Boolean(order?.sampleApprovedAt));
  const mightSubmitFeedback =
    user &&
    order &&
    !isClosedStatus &&
    (order.createdById === user.id ||
      ["SUPER_ADMIN", "MANAGING_DIRECTOR"].includes(user.role));

  /** When a sample was requested, division cannot complete until specs are head-approved and the submitter confirms they reviewed them. */
  const enquiryCompleteSampleGateOk =
    !order?.sampleRequested ||
    (Boolean(order.sampleApprovedAt) && Boolean(order.sampleSpecsAcknowledgedAt));

  const sampleMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const action = (body as { action?: string }).action;
      // Customer feedback goes to the dedicated endpoint
      if (action === "salesFeedback") {
        const res = await fetch(`/api/orders/${orderId}/customer-feedback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            feedback: body.salesFeedback,
            responseStatus: body.responseStatus,
            remarks: body.remarks,
            sampleReceivedAt: body.sampleReceivedAt,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((data as { error?: string }).error || "Failed to submit feedback");
        return data;
      }
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
      if (action === "ship" || action === "setDetails") {
        setSentByCourier(true);
        setCourierName("");
        setTrackingId("");
        setSampleProofFile(null);
      }
      if (action === "setDetails") {
        setSampleDetails("");
        setSampleQuantity("");
        setSampleWeight("");
      }
      if (action === "salesFeedback") {
        setSalesFeedback("");
        setFeedbackResponseStatus("");
        setFeedbackRemarks("");
        setFeedbackReceivedDate("");
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

  const effectiveNewDevPlan = useMemo(
    () => (order ? getEffectiveNewDevPlan(order) : null),
    [order?.id, order?.newDevPlan, order?.enquiryHandoff]
  );

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
        <Link href={backHref} className="inline-flex items-center gap-1 text-xs font-medium text-slate-400">
          {backLabel}
        </Link>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-8 w-36 animate-pulse rounded-lg bg-slate-100" />
            <div className="h-6 w-24 animate-pulse rounded-full bg-slate-100" />
          </div>
          <div className="h-4 w-56 animate-pulse rounded bg-slate-100" />
        </div>
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <div className="h-12 animate-pulse bg-slate-50" />
          <div className="divide-y divide-slate-100">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4">
                <div className="h-4 w-32 animate-pulse rounded bg-slate-100" />
                <div className="h-4 w-48 animate-pulse rounded bg-slate-100" />
              </div>
            ))}
          </div>
        </div>
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
      {/* Page header */}
      <header className="space-y-3">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 transition-colors hover:text-indigo-600"
        >
          {backLabel}
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span
                title={order.orderNumber ? formatEnquiryNumber(order.orderNumber) : "—"}
                className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 font-mono text-sm font-bold text-indigo-800 shadow-sm"
              >
                {order.orderNumber ? formatEnquiryNumberShort(order.orderNumber) : "—"}
              </span>
              <Badge
                variant={statusVariant[order.status] ?? "secondary"}
                className="text-xs font-semibold uppercase tracking-wide"
              >
                {order.status.replace("_", " ")}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
              {order.currentDivision?.name?.trim() ? (
                <span className="font-medium text-slate-700">{order.currentDivision.name}</span>
              ) : null}
              <span className="text-slate-300" aria-hidden>·</span>
              <time
                dateTime={order.createdAt}
                className={`tabular-nums ${placedDateClass(order, clientClockMs)}`}
                suppressHydrationWarning
              >
                {new Date(order.createdAt).toLocaleString()}
              </time>
            </div>
          </div>
        </div>
      </header>

      <Card className="overflow-hidden border border-slate-200 shadow-sm">
        <CardHeader className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/60 px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
          <CardTitle className="text-base font-semibold text-slate-800">Enquiry details</CardTitle>
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
                    onClick={() => {
                      setActionError("");
                      completeMutation.mutate();
                    }}
                    disabled={completeMutation.isPending || !enquiryCompleteSampleGateOk}
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
            {canAct && showInteractiveUi && order.status === "IN_PROGRESS" && order.sampleRequested && !enquiryCompleteSampleGateOk ? (
              <p className="basis-full w-full text-xs text-amber-900">
                {!order.sampleApprovedAt
                  ? "Complete stays disabled until the division approves the submitted sample specifications."
                  : "Complete stays disabled until the enquiry submitter confirms they reviewed the approved specifications (sample workflow below)."}
              </p>
            ) : null}
          </div>
          {actionError ? (
            <p className="px-6 pb-3 pt-0 text-sm text-red-600 sm:px-6">{actionError}</p>
          ) : null}
        </CardHeader>
        <CardContent className="p-0">
          <div className="flex flex-col gap-1 border-b border-indigo-100 bg-gradient-to-r from-indigo-50/80 to-violet-50/50 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-indigo-700">Enquiry number</span>
            <span className="font-mono text-sm font-bold tracking-tight text-indigo-900">
              {order.orderNumber ? formatEnquiryNumber(order.orderNumber) : "—"}
            </span>
          </div>
          <div className="divide-y divide-slate-100">
          {/* Customer identity fields — editable by salesperson while PLACED */}
          {(() => {
            const canEditEnquiry =
              showInteractiveUi &&
              user &&
              !isClosedStatus &&
              (
                // Salesperson can edit while order is still PLACED
                (["USER", "SUPERVISOR", "ASM"].includes(user.role) && order.createdById === user.id && order.status === "PLACED") ||
                // Division Head / Admin can edit customer details at any non-closed status
                (["MANAGER", "DIVISION_HEAD", "SUPER_ADMIN", "MANAGING_DIRECTOR"].includes(user.role) && isDivisionHead)
              );

            const handleEditGstUpload = async (file: File) => {
              setEditGstUploadError("");
              setEditGstUploading(true);
              try {
                const form = new FormData();
                form.append("file", file);
                const res = await fetch("/api/uploads/gst", { method: "POST", credentials: "include", body: form });
                let data: { url?: string; name?: string; error?: string } = {};
                try { data = await res.json(); } catch { /* empty body */ }
                if (!res.ok) throw new Error(data.error || "Upload failed");
                if (!data.url) throw new Error("Upload failed");
                setEditGstCopyUrl(JSON.stringify({ url: data.url, name: data.name ?? file.name }));
                setEditGstFileName(data.name ?? file.name);
              } catch (e) {
                setEditGstUploadError(e instanceof Error ? e.message : "Upload failed");
              } finally {
                setEditGstUploading(false);
              }
            };

            const openEdit = () => {
              setEditCustomerName(order.customerName ?? "");
              setEditCustomerPhone(order.customerPhone ?? "");
              setEditCustomerEmail(order.customerEmail ?? "");
              setEditCustomerAddress(order.customerAddress ?? "");
              setEditGstNumber(order.gstNumber ?? "");
              setEditGstCopyUrl(order.gstCopyUrl ?? "");
              const existing = parseGstCopy(order.gstCopyUrl);
              setEditGstFileName(existing?.name ?? "");
              setEditCompanyName(order.companyName ?? "");
              setEditDescription(order.description ?? "");
              setEditCustomerOrderDate(
                order.customerOrderDate
                  ? new Date(order.customerOrderDate).toISOString().split("T")[0]
                  : ""
              );
              setEditEnquiryError("");
              setEditingEnquiry(true);
            };

            const saveEdit = async () => {
              setEditEnquirySaving(true);
              setEditEnquiryError("");
              try {
                const res = await fetch(`/api/orders/${orderId}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  credentials: "include",
                  body: JSON.stringify({
                    customerName: editCustomerName,
                    customerPhone: editCustomerPhone,
                    customerEmail: editCustomerEmail,
                    customerAddress: editCustomerAddress,
                    gstNumber: editGstNumber,
                    gstCopyUrl: editGstCopyUrl,
                    companyName: editCompanyName,
                    description: editDescription,
                    customerOrderDate: editCustomerOrderDate,
                  }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Save failed");
                setEditingEnquiry(false);
                queryClient.invalidateQueries({ queryKey: ["order", orderId] });
              } catch (e) {
                setEditEnquiryError(e instanceof Error ? e.message : "Save failed");
              } finally {
                setEditEnquirySaving(false);
              }
            };

            return (
              <div className="bg-gradient-to-br from-blue-50/60 to-indigo-50/30 px-5 py-4 border-b border-blue-100">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-xs font-bold text-blue-700">C</div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-blue-700">Customer details</p>
                      {order.customerId && (
                        <p className="font-mono text-[10px] text-blue-500/80 mt-0.5 tracking-wide">{order.customerId}</p>
                      )}
                    </div>
                  </div>
                  {canEditEnquiry && !editingEnquiry && (
                    <button
                      type="button"
                      onClick={openEdit}
                      className="rounded-md border border-blue-200 bg-white/60 px-2.5 py-1 text-xs font-medium text-blue-700 transition-colors hover:bg-white hover:text-blue-900"
                    >
                      Edit details
                    </button>
                  )}
                </div>

                {editingEnquiry ? (
                  <div className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Customer name</label>
                        <input value={editCustomerName} onChange={(e) => setEditCustomerName(e.target.value)} className="flex h-8 w-full rounded border border-slate-200 bg-white px-2.5 text-sm" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Phone</label>
                        <input value={editCustomerPhone} onChange={(e) => setEditCustomerPhone(e.target.value)} className="flex h-8 w-full rounded border border-slate-200 bg-white px-2.5 text-sm" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Email ID</label>
                        <input type="email" value={editCustomerEmail} onChange={(e) => setEditCustomerEmail(e.target.value)} className="flex h-8 w-full rounded border border-slate-200 bg-white px-2.5 text-sm" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Company name</label>
                        <input value={editCompanyName} onChange={(e) => setEditCompanyName(e.target.value)} className="flex h-8 w-full rounded border border-slate-200 bg-white px-2.5 text-sm" />
                      </div>
                      <div className="space-y-1 sm:col-span-2">
                        <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Address</label>
                        <textarea value={editCustomerAddress} onChange={(e) => setEditCustomerAddress(e.target.value)} rows={2} className="flex min-h-[52px] w-full rounded border border-slate-200 bg-white px-2.5 py-1.5 text-sm" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Customer enquiry date</label>
                        <input type="date" value={editCustomerOrderDate} onChange={(e) => setEditCustomerOrderDate(e.target.value)} className="flex h-8 w-full rounded border border-slate-200 bg-white px-2.5 text-sm" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">GST number <span className="font-normal text-slate-300">(optional)</span></label>
                        <input value={editGstNumber} onChange={(e) => setEditGstNumber(e.target.value.toUpperCase())} className="flex h-8 w-full rounded border border-slate-200 bg-white px-2.5 font-mono text-sm" />
                      </div>
                      <div className="space-y-1 sm:col-span-2">
                        <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">GST certificate <span className="font-normal text-slate-300">(optional)</span></label>
                        {editGstCopyUrl ? (
                          <div className="flex items-center gap-2 rounded border border-emerald-200 bg-emerald-50 px-2.5 py-1.5">
                            <span className="flex-1 truncate text-xs font-medium text-emerald-800">{editGstFileName || "File uploaded"}</span>
                            <button type="button" onClick={() => { setEditGstCopyUrl(""); setEditGstFileName(""); }} className="text-[10px] text-slate-500 hover:text-red-600 underline">Remove</button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => editGstFileRef.current?.click()}
                            disabled={editGstUploading}
                            className="flex h-8 w-full items-center justify-center rounded border border-dashed border-slate-300 bg-white px-2.5 text-xs text-slate-500 hover:border-slate-400 hover:bg-slate-50 disabled:opacity-60"
                          >
                            {editGstUploading ? "Uploading…" : "Click to upload PDF / JPG / PNG"}
                          </button>
                        )}
                        <input
                          ref={editGstFileRef}
                          type="file"
                          accept=".pdf,.png,.jpg,.jpeg,.webp"
                          className="hidden"
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleEditGstUpload(f); }}
                        />
                        {editGstUploadError && <p className="text-[10px] text-red-600">{editGstUploadError}</p>}
                      </div>
                      <div className="space-y-1 sm:col-span-2">
                        <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Product description</label>
                        <input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} className="flex h-8 w-full rounded border border-slate-200 bg-white px-2.5 text-sm" />
                      </div>
                    </div>
                    {editEnquiryError && <p className="text-xs text-red-600">{editEnquiryError}</p>}
                    <div className="flex gap-2">
                      <button type="button" onClick={() => void saveEdit()} disabled={editEnquirySaving} className="rounded bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-60">
                        {editEnquirySaving ? "Saving…" : "Save changes"}
                      </button>
                      <button type="button" onClick={() => setEditingEnquiry(false)} className="rounded border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                    {order.customerName ? (
                      <p className="flex flex-col">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Customer name</span>
                        <span className="text-sm font-medium text-slate-800">{order.customerName}</span>
                      </p>
                    ) : null}
                    {order.customerPhone ? (
                      <p className="flex flex-col">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Phone</span>
                        <span className="text-sm font-medium text-slate-800">{order.customerPhone}</span>
                      </p>
                    ) : null}
                    {order.customerEmail ? (
                      <p className="flex flex-col">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Email ID</span>
                        <span className="text-sm font-medium text-slate-800">{order.customerEmail}</span>
                      </p>
                    ) : null}
                    {order.companyName ? (
                      <p className="flex flex-col">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Company name</span>
                        <span className="text-sm font-semibold text-slate-900">{order.companyName}</span>
                      </p>
                    ) : null}
                    {order.customerAddress ? (
                      <p className="flex flex-col sm:col-span-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Address</span>
                        <span className="text-sm font-medium text-slate-800 whitespace-pre-wrap">{order.customerAddress}</span>
                      </p>
                    ) : null}
                    {order.customerOrderDate ? (
                      <p className="flex flex-col">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Customer enquiry date</span>
                        <span className="text-sm font-medium text-slate-800">{new Date(order.customerOrderDate).toLocaleDateString()}</span>
                      </p>
                    ) : null}
                    {order.gstNumber ? (
                      <p className="flex flex-col">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">GST number</span>
                        <span className="font-mono text-sm font-medium text-slate-800">{order.gstNumber}</span>
                      </p>
                    ) : (
                      <p className="flex flex-col">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">GST</span>
                        <span className="text-sm text-slate-400 italic">N/A</span>
                      </p>
                    )}
                    {(() => {
                      const gst = parseGstCopy(order.gstCopyUrl);
                      if (!gst) return null;
                      const gstServeUrl = `/api/orders/${order.id}/gst-certificate`;
                      return (
                        <div className="flex flex-col sm:col-span-2">
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">GST certificate</span>
                          <div className="mt-1 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                            <span className="flex-1 truncate text-sm font-medium text-slate-800">{gst.name}</span>
                            <a
                              href={gstServeUrl}
                              rel="noopener noreferrer"
                              className="rounded bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700"
                            >
                              View
                            </a>
                            <a
                              href={gstServeUrl}
                              download={gst.name}
                              className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                            >
                              Download
                            </a>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            );
          })()}
          <p className="flex flex-col gap-0.5 px-5 py-3.5 sm:flex-row sm:items-baseline sm:gap-3">
            <span className="min-w-[10rem] shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-400">Product description</span>
            <span className="text-sm font-medium text-slate-800">
            {order.description?.trim() ? order.description : "—"}
            </span>
          </p>
          <p className="flex flex-col gap-0.5 px-5 py-3.5 sm:flex-row sm:items-baseline sm:gap-3">
            <span className="min-w-[10rem] shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-400">Created by</span>
            <span className="text-sm font-semibold text-slate-900">{order.createdBy?.name} <span className="font-normal text-slate-500">({order.createdBy?.email})</span></span>
          </p>
          {order.acceptanceReason?.trim() ? (
            <p className="flex flex-col gap-0.5 px-5 py-3.5 sm:flex-row sm:items-baseline sm:gap-3">
              <span className="min-w-[10rem] shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-400">Acceptance reason</span>
              <span className="text-sm text-slate-700 whitespace-pre-wrap">{order.acceptanceReason}</span>
            </p>
          ) : null}
          {order.receiveReason?.trim() ? (
            <p className="flex flex-col gap-0.5 px-5 py-3.5 sm:flex-row sm:items-baseline sm:gap-3">
              <span className="min-w-[10rem] shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-400">Receive reason</span>
              <span className="text-sm text-slate-700 whitespace-pre-wrap">{order.receiveReason}</span>
            </p>
          ) : null}
          {order.assignedSupervisor ? (
            <p className="flex flex-col gap-0.5 px-5 py-3.5 sm:flex-row sm:items-baseline sm:gap-3">
              <span className="min-w-[10rem] shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-400">Assigned supervisor</span>
              <span className="text-sm font-semibold text-slate-900">
                {order.assignedSupervisor.name} <span className="font-normal text-slate-500">({order.assignedSupervisor.email})</span>
              </span>
            </p>
          ) : null}
          {order.enquiryHandoff && typeof order.enquiryHandoff === "object" ? (
            <div className="px-5 py-3.5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Development classification</p>
                {showInteractiveUi && user && ["MANAGER", "DIVISION_HEAD", "SUPER_ADMIN", "MANAGING_DIRECTOR"].includes(user.role) && isDivisionHead && !isClosedStatus ? (
                  <button
                    type="button"
                    onClick={() => {
                      const plan = effectiveNewDevPlan;
                      const handoff = order.enquiryHandoff as Record<string, unknown>;
                      if (handoff.developmentKind === "new" && plan) {
                        setNewDevDescription(typeof plan.description === "string" ? plan.description : "");
                        setNewDevResources(typeof plan.resourcesRequired === "string" ? plan.resourcesRequired : "");
                        setNewDevResearch(typeof plan.researchRequirements === "string" ? plan.researchRequirements : "");
                        setNewDevPlanningNotes(typeof plan.planningNotes === "string" ? plan.planningNotes : "");
                        setNewDevTimeline(typeof plan.estimatedTimeline === "string" ? plan.estimatedTimeline : "");
                        setNewDevCompletionDuration(typeof plan.expectedCompletionDuration === "string" ? plan.expectedCompletionDuration : "");
                        setNewDevInternalNotes(typeof plan.internalNotes === "string" ? plan.internalNotes : "");
                        setNewDevReason(typeof plan.reasonForNewDevelopment === "string" ? plan.reasonForNewDevelopment : "");
                        setIsEditingDevPlan(true);
                        setNewDevDialogError("");
                        setNewDevDialogOpen(true);
                      } else if (handoff.developmentKind === "existing") {
                        // For existing development, re-open handoff (no dialog needed — handled by handoff form re-show)
                        // Not applicable here; just a safeguard
                      }
                    }}
                    className="rounded-md border border-violet-200 bg-white/60 px-2.5 py-1 text-xs font-medium text-violet-700 transition-colors hover:bg-white hover:text-violet-900"
                  >
                    Edit development plan
                  </button>
                ) : null}
              </div>
              <div className="rounded-xl border border-slate-100 bg-gradient-to-br from-slate-50/80 to-white p-3 space-y-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${order.enquiryHandoff.developmentKind === "existing" ? "bg-blue-50 text-blue-700 ring-blue-200" : "bg-violet-50 text-violet-700 ring-violet-200"}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${order.enquiryHandoff.developmentKind === "existing" ? "bg-blue-500" : "bg-violet-500"}`} />
                  {order.enquiryHandoff.developmentKind === "existing" ? "Existing development" : "New development"}
                </span>
                {typeof order.enquiryHandoff.existingProductDetails === "string" && order.enquiryHandoff.existingProductDetails.trim() ? (
                  <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{order.enquiryHandoff.existingProductDetails}</p>
                ) : null}
                {/* New Development Plan details */}
                {order.enquiryHandoff.developmentKind === "new" && effectiveNewDevPlan ? (
                  <div className="mt-2 space-y-2 border-t border-slate-100 pt-2">
                    {(["description","resourcesRequired","researchRequirements","planningNotes","estimatedTimeline","expectedCompletionDuration","reasonForNewDevelopment"] as const).map((key) => {
                      const labels: Record<string, string> = {
                        description: "Development description",
                        resourcesRequired: "Resources / materials",
                        researchRequirements: "Research requirements",
                        planningNotes: "Planning notes",
                        estimatedTimeline: "Estimated timeline",
                        expectedCompletionDuration: "Expected completion",
                        reasonForNewDevelopment: "Reason for new development",
                      };
                      const val = effectiveNewDevPlan[key];
                      if (typeof val !== "string" || !val.trim()) return null;
                      const displayText =
                        (key === "estimatedTimeline" || key === "expectedCompletionDuration")
                          ? formatStoredPlanDate(val)
                          : val;
                      return (
                        <div key={key}>
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{labels[key]}</p>
                          <p className="text-sm text-slate-800 whitespace-pre-wrap">{displayText}</p>
                        </div>
                      );
                    })}
                    {/* Internal notes — MD / Super Admin only */}
                    {user && ["MANAGING_DIRECTOR", "SUPER_ADMIN"].includes(user.role) && typeof effectiveNewDevPlan.internalNotes === "string" && effectiveNewDevPlan.internalNotes.trim() ? (
                      <div className="rounded-lg border border-amber-100 bg-amber-50 p-2.5">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-600">Internal notes (MD / Super Admin only)</p>
                        <p className="text-sm text-amber-900 whitespace-pre-wrap">{effectiveNewDevPlan.internalNotes}</p>
                      </div>
                    ) : null}
                    {/* Planning timing — MD / Super Admin only */}
                    {user && ["MANAGING_DIRECTOR", "SUPER_ADMIN"].includes(user.role) ? (() => {
                      const p = effectiveNewDevPlan;
                      const recvAt = typeof p.enquiryReceivedAt === "string" ? new Date(p.enquiryReceivedAt) : null;
                      const subAt = typeof p.planningSubmittedAt === "string" ? new Date(p.planningSubmittedAt) : null;
                      const durationHrs = recvAt && subAt ? Math.round((subAt.getTime() - recvAt.getTime()) / 36e5) : null;
                      return (
                        <div className="rounded-lg border border-slate-100 bg-slate-50 p-2.5 space-y-0.5">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Planning timing (MD / Super Admin only)</p>
                          {recvAt ? <p className="text-xs text-slate-600">Enquiry received: <span className="font-mono">{recvAt.toLocaleString()}</span></p> : null}
                          {subAt ? <p className="text-xs text-slate-600">Planning submitted: <span className="font-mono">{subAt.toLocaleString()}</span></p> : null}
                          {durationHrs !== null ? <p className="text-xs text-slate-600">Planning duration: <span className="font-semibold">{durationHrs}h</span></p> : null}
                        </div>
                      );
                    })() : null}
                  </div>
                ) : order.enquiryHandoff.developmentKind === "new" &&
                  typeof order.enquiryHandoff.newDevelopmentDetails === "string" &&
                  order.enquiryHandoff.newDevelopmentDetails.trim() ? (
                  <div className="mt-2 space-y-1 border-t border-slate-100 pt-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Development description</p>
                    <p className="text-sm text-slate-800 whitespace-pre-wrap">{order.enquiryHandoff.newDevelopmentDetails}</p>
                    <p className="text-xs text-amber-800">
                      Full planning fields are being restored from stored handoff data. Use &quot;Edit development plan&quot; if anything is missing.
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
          </div>
          {order.status === "CANCELLED" && order.cancellationReason ? (
            <div className="mx-5 mb-4 mt-1 rounded-xl border border-stone-200 bg-stone-50 p-4 text-sm">
              <p className="font-semibold text-stone-800">This enquiry was cancelled</p>
              <p className="mt-1.5 text-stone-700">
                <span className="font-medium text-stone-500">Reason: </span>{order.cancellationReason}
              </p>
              {order.cancelledAt ? (
                <p className="mt-2 text-xs text-stone-400">
                  {order.cancelledBy?.name ? `${order.cancelledBy.name} · ` : ""}
                  {new Date(order.cancelledAt).toLocaleString()}
                </p>
              ) : null}
            </div>
          ) : null}
          <p className="flex flex-col gap-0.5 px-5 py-3.5 sm:flex-row sm:items-baseline sm:gap-3">
            <span className="min-w-[10rem] shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-400">Sample requested</span>
            <span className="text-sm font-semibold text-slate-900">
            {order.sampleRequested ? "Yes" : "No"}
            {order.sampleRequested && !order.sampleRequestNotes?.trim() ? " (no notes)" : null}
            </span>
          </p>
          {order.sampleRequested && order.sampleRequestNotes?.trim() ? (
            <p className="flex flex-col gap-0.5 px-5 py-3.5 sm:flex-row sm:items-baseline sm:gap-3">
              <span className="min-w-[10rem] shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-400">Sample request notes</span>
              <span className="text-sm font-medium text-slate-800">{order.sampleRequestNotes}</span>
            </p>
          ) : null}
          {(() => {
            const INTERNAL_CF_KEYS = new Set(["supervisorHandoff", "sampleDevelopment", "sampleStatusUpdates", "enquiryHandoff", "newDevelopment"]);
            const userFields = order.customFields && typeof order.customFields === "object"
              ? Object.entries(order.customFields as Record<string, unknown>).filter(([k]) => !INTERNAL_CF_KEYS.has(k))
              : [];
            if (userFields.length === 0) return null;
            return (
              <div className="px-5 py-3.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Custom fields</span>
                <ul className="mt-2 space-y-1">
                  {userFields.map(([k, v]) => (
                    <li key={k} className="flex gap-2 text-sm">
                      <span className="font-medium text-slate-600">{k}:</span>
                      <span className="text-slate-800">{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })()}
          {order.slaDeadline ? (
            <p className="flex flex-col gap-0.5 px-5 py-3.5 sm:flex-row sm:items-baseline sm:gap-3">
              <span className="min-w-[10rem] shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-400">SLA deadline</span>
              <time className="text-sm font-semibold text-slate-900" dateTime={order.slaDeadline} suppressHydrationWarning>
                {new Date(order.slaDeadline).toLocaleString()}
              </time>
            </p>
          ) : null}
          {openSlaBreach ? (
            <div className="mx-5 mb-4 mt-1 rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50/60 p-4 text-sm">
              <p className="font-semibold text-amber-900">⚠ SLA breach recorded</p>
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

              {showInteractiveUi && awaitingHeadRejection && isDivisionHead && ["MANAGER", "DIVISION_HEAD"].includes(user?.role ?? "") ? (
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
            <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-5 py-3.5 text-sm">
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

      {!isAuditView && showHandoffCard ? (
        <Card className="overflow-hidden border border-indigo-100 shadow-sm ring-1 ring-indigo-50">
          <CardHeader className="border-b border-indigo-100 bg-gradient-to-r from-indigo-50/80 to-violet-50/50 px-5 py-4">
            <CardTitle className="text-base font-semibold text-indigo-900">
              {canReassignHandoff && !needsHandoff ? "Update supervisor & development" : "Assign supervisor & development"}
            </CardTitle>
            <p className="mt-0.5 text-xs text-indigo-700/70">
              {canReassignHandoff && !needsHandoff
                ? "Change the assigned ASM / supervisor or update development classification. Blocked after the sample has been marked shipped."
                : "Choose an ASM / supervisor from this division only, then classify the enquiry as new or existing development."}
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
                    {!pendingNewDevPlan ? (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 flex items-center justify-between gap-3">
                        <p className="text-xs text-amber-800 font-medium">Planning details required for new development.</p>
                        <button
                          type="button"
                          className="shrink-0 rounded bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-700"
                          onClick={() => setNewDevDialogOpen(true)}
                        >
                          Fill planning form
                        </button>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold text-emerald-800">Planning details completed ✓</p>
                          <p className="text-xs text-emerald-700 truncate max-w-xs">{pendingNewDevPlan.description}</p>
                        </div>
                        <button
                          type="button"
                          className="shrink-0 rounded border border-emerald-300 bg-white px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                          onClick={() => setNewDevDialogOpen(true)}
                        >
                          Edit
                        </button>
                      </div>
                    )}
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
                    (handoffDevKind === "new" ? !pendingNewDevPlan : handoffExistingDetails.trim().length < 10)
                  }
                  onClick={() => {
                    setHandoffError("");
                    handoffMutation.mutate();
                  }}
                >
                  {handoffMutation.isPending ? "Submitting…" : canReassignHandoff && !needsHandoff ? "Save assignment" : "Submit assignment"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      ) : null}

      {!isAuditView && userMayViewEnquiryExecInsights(user?.role) && (
        <>
          <Card className="overflow-hidden border border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100 bg-slate-50/60 px-5 py-4">
              <CardTitle className="text-base font-semibold text-slate-800">Enquiry pipeline</CardTitle>
              <p className="mt-0.5 text-xs text-slate-500">Stages for this enquiry at a glance.</p>
            </CardHeader>
            <CardContent className="px-5 py-4">
              <EnquiryPipelineStrip order={order} />
            </CardContent>
          </Card>
          <Card className="overflow-hidden border border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100 bg-slate-50/60 px-5 py-4">
              <CardTitle className="text-base font-semibold text-slate-800">Detailed timestamps</CardTitle>
              <p className="mt-0.5 text-xs text-slate-500">
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
        <Card className="overflow-hidden border border-slate-200 shadow-sm">
          <CardHeader className="border-b border-violet-100 bg-gradient-to-br from-violet-50/70 via-purple-50/30 to-slate-50/50 px-5 py-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-sm font-bold text-violet-700">S</div>
              <div className="min-w-0">
                <CardTitle className="text-base font-semibold text-slate-800">Sample workflow</CardTitle>
                <p className="mt-0.5 text-xs text-violet-700/70">
                  Head approves request → supervisor submits details → head approves details → ship → sales records feedback
                </p>
              </div>
            </div>
          </CardHeader>

          {/* Status badges strip */}
          <div className="flex flex-wrap gap-2 border-b border-slate-100 bg-slate-50/40 px-5 py-3">
            {order.headSampleRequestApprovedAt ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Request approved{order.headSampleRequestApprovedBy?.name ? ` · ${order.headSampleRequestApprovedBy.name}` : ""}
              </span>
            ) : order.sampleRequested && !legacySampleProgress ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
                {sampleRequestApprovalPrereqMet
                  ? "Awaiting head approval"
                  : "Supervisor assignment required first"}
              </span>
            ) : null}
            {order.sampleApprovedAt && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Details approved{order.sampleApprovedBy?.name ? ` · ${order.sampleApprovedBy.name}` : ""}
              </span>
            )}
            {order.sampleShippedAt && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 ring-1 ring-indigo-200">
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                Shipped · {new Date(order.sampleShippedAt).toLocaleDateString()}
              </span>
            )}
            {order.sampleSpecsAcknowledgedAt && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800 ring-1 ring-sky-200">
                <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
                Submitter reviewed specs
                {order.sampleSpecsAcknowledgedBy?.name ? ` · ${order.sampleSpecsAcknowledgedBy.name}` : ""}
              </span>
            )}
          </div>

          {showInteractiveUi &&
          order.sampleApprovedAt &&
          !order.sampleSpecsAcknowledgedAt &&
          isEnquirySubmitter &&
          !isClosedStatus ? (
            <div className="border-b border-sky-200 bg-sky-50/90 px-5 py-4">
              <p className="text-sm font-semibold text-sky-950">Confirm you have seen the approved sample specifications</p>
              <p className="mt-1 text-xs text-sky-900/90 leading-relaxed">
                The division has approved the sample details. After you confirm here, the division can mark this enquiry complete.
              </p>
              <Button
                type="button"
                size="sm"
                className="mt-3 bg-sky-700 hover:bg-sky-800"
                disabled={acknowledgeSpecsMutation.isPending}
                onClick={() => {
                  setSampleError("");
                  acknowledgeSpecsMutation.mutate();
                }}
              >
                {acknowledgeSpecsMutation.isPending ? "Saving…" : "I have reviewed the specifications"}
              </Button>
            </div>
          ) : null}

          <CardContent className="p-0">

            {/* Development type */}
            {sampleDevelopment && (
              <div className="border-b border-slate-100 px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Development classification</p>
                  {sampleDevelopmentUpdatedAtLabel && (
                    <span className="text-xs text-slate-400">Updated {sampleDevelopmentUpdatedAtLabel}</span>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${sampleDevelopment.type === "existing" ? "bg-blue-50 text-blue-700 ring-blue-200" : "bg-violet-50 text-violet-700 ring-violet-200"}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${sampleDevelopment.type === "existing" ? "bg-blue-500" : "bg-violet-500"}`} />
                    {sampleDevelopment.type === "existing" ? "Existing development" : "New development"}
                  </span>
                  {sampleDevelopment.type === "new" && (
                    <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setNewDevViewOpen(true)}>
                      View details →
                    </Button>
                  )}
                </div>
                {sampleDevelopment.type === "existing" && typeof sampleDevelopment.existingReference === "string" && sampleDevelopment.existingReference.trim() && (
                  <p className="mt-2 text-sm text-slate-700">
                    <span className="text-slate-400">Reference: </span>{sampleDevelopment.existingReference}
                  </p>
                )}
              </div>
            )}

            {/* Sample details display */}
            {canSeeSampleDetails && (order.sampleDetails || order.sampleQuantity || order.sampleWeight || (order as { sampleRemarks?: string | null }).sampleRemarks || (order as { sampleDeliveryDate?: string | null }).sampleDeliveryDate) && (
              <div className="border-b border-slate-100 px-5 py-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Sample details</p>
                  {showInteractiveUi && assignedSupervisorMe && !editingSample && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditSampleDetails(order.sampleDetails ?? "");
                        setEditSampleQuantity(order.sampleQuantity ?? "");
                        setEditSampleWeight(order.sampleWeight ?? "");
                        setEditSampleRemarks((order as { sampleRemarks?: string | null }).sampleRemarks ?? "");
                        setEditCourierName(order.courierName ?? "");
                        setEditTrackingId(order.trackingId ?? "");
                        setEditSampleByCourier(order.sampleShippedByCourier ?? true);
                        setEditSampleDeliveryDate(
                          (order as { sampleDeliveryDate?: string | null }).sampleDeliveryDate
                            ? new Date((order as { sampleDeliveryDate: string }).sampleDeliveryDate).toISOString().split("T")[0]
                            : ""
                        );
                        setEditSampleError("");
                        setEditingSample(true);
                      }}
                      className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
                    >
                      Edit details
                    </button>
                  )}
                </div>
                {editingSample ? (
                  <div className="mt-3 space-y-3 rounded-xl border border-violet-100 bg-violet-50/30 p-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1 sm:col-span-2">
                        <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Sample details</label>
                        <textarea value={editSampleDetails} onChange={(e) => setEditSampleDetails(e.target.value)} rows={2} className="flex w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Quantity</label>
                        <input value={editSampleQuantity} onChange={(e) => setEditSampleQuantity(e.target.value)} className="flex h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Weight</label>
                        <input value={editSampleWeight} onChange={(e) => setEditSampleWeight(e.target.value)} className="flex h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Delivery date</label>
                        <input type="date" value={editSampleDeliveryDate} onChange={(e) => setEditSampleDeliveryDate(e.target.value)} className="flex h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Courier name</label>
                        <input value={editCourierName} onChange={(e) => setEditCourierName(e.target.value)} className="flex h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Tracking ID</label>
                        <input value={editTrackingId} onChange={(e) => setEditTrackingId(e.target.value)} className="flex h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
                      </div>
                      <div className="space-y-1 sm:col-span-2">
                        <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Remarks</label>
                        <input value={editSampleRemarks} onChange={(e) => setEditSampleRemarks(e.target.value)} className="flex h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
                      </div>
                    </div>
                    {editSampleError && <p className="text-xs text-red-600">{editSampleError}</p>}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={editSampleSaving}
                        onClick={async () => {
                          setEditSampleSaving(true);
                          setEditSampleError("");
                          try {
                            const res = await fetch(`/api/orders/${orderId}`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              credentials: "include",
                              body: JSON.stringify({
                                sampleDetails: editSampleDetails,
                                sampleQuantity: editSampleQuantity,
                                sampleWeight: editSampleWeight,
                                sampleRemarks: editSampleRemarks,
                                sampleDeliveryDate: editSampleDeliveryDate,
                                courierName: editCourierName,
                                trackingId: editTrackingId,
                                sampleShippedByCourier: editSampleByCourier,
                              }),
                            });
                            const data = await res.json();
                            if (!res.ok) throw new Error(data.error || "Save failed");
                            setEditingSample(false);
                            queryClient.invalidateQueries({ queryKey: ["order", orderId] });
                          } catch (e) {
                            setEditSampleError(e instanceof Error ? e.message : "Save failed");
                          } finally {
                            setEditSampleSaving(false);
                          }
                        }}
                        className="rounded-lg bg-violet-600 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-violet-700 disabled:opacity-60"
                      >
                        {editSampleSaving ? "Saving…" : "Save changes"}
                      </button>
                      <button type="button" onClick={() => setEditingSample(false)} className="rounded-lg border border-slate-200 px-4 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                    {order.sampleDetails && (
                      <p className="flex flex-col sm:col-span-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Details</span>
                        <span className="text-slate-800">{order.sampleDetails}</span>
                      </p>
                    )}
                    {order.sampleQuantity && (
                      <p className="flex flex-col">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Quantity</span>
                        <span className="text-slate-800">{order.sampleQuantity}</span>
                      </p>
                    )}
                    {order.sampleWeight && (
                      <p className="flex flex-col">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Weight</span>
                        <span className="text-slate-800">{order.sampleWeight}</span>
                      </p>
                    )}
                    {(order as { sampleDeliveryDate?: string | null }).sampleDeliveryDate && (
                      <p className="flex flex-col">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Delivery date</span>
                        <span className="text-slate-800">{new Date((order as { sampleDeliveryDate: string }).sampleDeliveryDate).toLocaleDateString()}</span>
                      </p>
                    )}
                    {(order as { sampleRemarks?: string | null }).sampleRemarks && (
                      <p className="flex flex-col sm:col-span-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Remarks</span>
                        <span className="text-slate-800">{(order as { sampleRemarks: string }).sampleRemarks}</span>
                      </p>
                    )}
                    {order.courierName && (
                      <p className="flex flex-col">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Courier</span>
                        <span className="text-slate-800">{order.courierName}{order.trackingId ? ` · ${order.trackingId}` : ""}</span>
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {!canSeeSampleDetails && (order.sampleDetails || order.sampleQuantity || order.sampleWeight) ? (
              <div className="border-b border-slate-100 px-5 py-4">
                <p className="rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-3 text-sm text-slate-600">
                  Sample details are pending head approval and will appear here after approval.
                </p>
              </div>
            ) : null}

            {/* Shipment record */}
            {order.sampleShippedAt && (
              <div className="border-b border-emerald-100 bg-emerald-50/30 px-5 py-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-emerald-700">Shipment record</p>
                <div className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                  <p className="flex flex-col">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Shipped on</span>
                    <span className="text-slate-800">{new Date(order.sampleShippedAt).toLocaleString()}</span>
                  </p>
                  <p className="flex flex-col">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Method</span>
                    <span className="text-slate-800">{order.sampleShippedByCourier === false ? "Hand delivery" : "By courier"}</span>
                  </p>
                  {order.courierName && (
                    <p className="flex flex-col">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Courier</span>
                      <span className="text-slate-800">{order.courierName}</span>
                    </p>
                  )}
                  {order.trackingId && (
                    <p className="flex flex-col">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Tracking ID</span>
                      <span className="font-mono text-slate-800">{order.trackingId}</span>
                    </p>
                  )}
                  {order.sampleProofUrl && (
                    <p className="flex flex-col sm:col-span-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Proof</span>
                      <a className="text-sm font-medium text-blue-600 underline underline-offset-2" href={order.sampleProofUrl} target="_blank" rel="noreferrer">
                        View proof ↗
                      </a>
                    </p>
                  )}
                </div>
                {order.sampleProofUrl && sampleProofUrlKind(order.sampleProofUrl) === "image" && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={order.sampleProofUrl} alt="Sample shipment proof" className="mt-3 max-h-96 w-full max-w-lg rounded-xl border border-slate-200 bg-white object-contain" />
                )}
                {order.sampleProofUrl && sampleProofUrlKind(order.sampleProofUrl) === "pdf" && (
                  <iframe title="Sample shipment proof" src={order.sampleProofUrl} className="mt-3 h-112 w-full max-w-2xl rounded-xl border border-slate-200 bg-white" />
                )}
              </div>
            )}

            {/* Sales feedback display */}
            {order.salesFeedback && (
              <div className="border-b border-slate-100 px-5 py-4">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">Sales feedback</p>
                <p className="text-sm text-slate-800">{order.salesFeedback}</p>
                {order.salesFeedbackAt && <p className="mt-1 text-xs text-slate-400">{new Date(order.salesFeedbackAt).toLocaleString()}</p>}
              </div>
            )}

            {/* Customer feedback display */}
            {order.customerFeedback && (
              <div className="border-b border-slate-100 px-5 py-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Customer feedback</p>
                  {order.customerResponseStatus && (
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${{
                      POSITIVE: "bg-emerald-50 text-emerald-700 ring-emerald-200",
                      NEUTRAL: "bg-amber-50 text-amber-700 ring-amber-200",
                      NEGATIVE: "bg-red-50 text-red-700 ring-red-200",
                      PENDING: "bg-blue-50 text-blue-700 ring-blue-200",
                    }[order.customerResponseStatus] ?? "bg-slate-50 text-slate-600 ring-slate-200"}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${{
                        POSITIVE: "bg-emerald-500",
                        NEUTRAL: "bg-amber-500",
                        NEGATIVE: "bg-red-500",
                        PENDING: "bg-blue-500",
                      }[order.customerResponseStatus] ?? "bg-slate-400"}`} />
                      {order.customerResponseStatus}
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-800 leading-relaxed">{order.customerFeedback}</p>
                {order.customerFeedbackRemarks && <p className="mt-1.5 text-xs text-slate-500">{order.customerFeedbackRemarks}</p>}
                {order.customerFeedbackAt && <p className="mt-1 text-xs text-slate-400">{new Date(order.customerFeedbackAt).toLocaleString()}</p>}
              </div>
            )}

            {sampleError && (
              <div className="mx-5 my-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{sampleError}</div>
            )}

            {/* ── Division Head Actions ── */}
            {showInteractiveUi && mightManageSample && (
              <div className="border-t-2 border-indigo-100 bg-gradient-to-br from-indigo-50/60 via-blue-50/30 to-slate-50/40 px-5 py-5 space-y-4">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-1 rounded-full bg-indigo-500" />
                  <p className="text-xs font-bold uppercase tracking-widest text-indigo-700">Division Head Actions</p>
                </div>

                {order.sampleRequested && !order.headSampleRequestApprovedAt && mightManageSample ? (
                  <div className="rounded-xl border border-indigo-200 bg-white/90 p-4 shadow-sm space-y-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Approve sample request</p>
                      <p className="mt-0.5 text-xs text-slate-500">Salesperson has requested a sample. Approve so the assigned supervisor can submit sample specifications.</p>
                    </div>
                    {sampleRequestApprovalPrereqMet ? (
                      <Button type="button" size="sm" disabled={sampleMutation.isPending} onClick={() => sampleMutation.mutate({ action: "approveSampleRequest" })}>
                        Approve sample request
                      </Button>
                    ) : (
                      <p className="rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-2 text-xs text-amber-900">
                        Submit <span className="font-semibold">supervisor assignment</span> in the enquiry handoff section above first (including planning details for new development). The server requires that before this approval step.
                      </p>
                    )}
                  </div>
                ) : null}

                {sampleGateOk && !order.sampleApprovedAt && mightManageSample && !assignedSupervisorMe && (
                  <div className="rounded-xl border border-indigo-200 bg-white/90 p-4 shadow-sm space-y-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Approve sample details</p>
                      {!canApproveSampleNow ? (
                        <p className="mt-0.5 text-xs text-slate-500">Wait for the supervisor to submit sample details first, then approve here.</p>
                      ) : (
                        <p className="mt-0.5 text-xs text-emerald-700">Sample details have been submitted — ready to review and approve.</p>
                      )}
                    </div>
                    {canApproveSampleNow && (
                      <Button type="button" size="sm" variant="outline" disabled={sampleMutation.isPending} onClick={() => setApproveSampleOpen(true)}>
                        Approve sample…
                      </Button>
                    )}
                  </div>
                )}

                {sampleGateOk && order.sampleShippedAt && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 shadow-sm space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      <p className="text-sm font-semibold text-emerald-900">Shipment recorded</p>
                      <span className="ml-auto text-xs text-slate-400">{new Date(order.sampleShippedAt).toLocaleString()}</span>
                    </div>
                    <div className="rounded-lg border border-emerald-100 bg-white px-4 py-3 space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="w-20 text-xs font-medium text-slate-500">Method</span>
                        <span className="text-slate-800">{order.sampleShippedByCourier === false ? "Hand delivery" : "By courier"}</span>
                      </div>
                      {order.courierName && (
                        <div className="flex items-center gap-2">
                          <span className="w-20 text-xs font-medium text-slate-500">Courier</span>
                          <span className="text-slate-800">{order.courierName}</span>
                        </div>
                      )}
                      {order.trackingId && (
                        <div className="flex items-center gap-2">
                          <span className="w-20 text-xs font-medium text-slate-500">Tracking</span>
                          <span className="font-mono text-slate-800">{order.trackingId}</span>
                        </div>
                      )}
                      {order.sampleProofUrl && (
                        <div className="flex items-center gap-2">
                          <span className="w-20 text-xs font-medium text-slate-500">Proof</span>
                          <a
                            href={`/api/orders/${orderId}/sample-proof`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm font-medium text-blue-600 underline underline-offset-2"
                          >
                            View proof ↗
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {sampleGateOk && order.sampleApprovedAt && !order.sampleShippedAt && (
                  <div className="rounded-xl border border-indigo-200 bg-white/90 p-4 shadow-sm space-y-3">
                    <p className="text-sm font-semibold text-slate-900">Mark sample shipped</p>
                    {/* Shipment details were captured by the supervisor when they submitted sample details */}
                    {order.courierName ? (
                      <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 space-y-1 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-slate-500 w-20">Method</span>
                          <span className="text-slate-800">By courier</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-slate-500 w-20">Courier</span>
                          <span className="text-slate-800">{order.courierName}</span>
                        </div>
                        {order.trackingId && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-slate-500 w-20">Tracking</span>
                            <span className="font-mono text-slate-800">{order.trackingId}</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500">Direct handover (no courier).</p>
                    )}
                    <Button
                      type="button" size="sm"
                      disabled={sampleMutation.isPending}
                      onClick={() =>
                        sampleMutation.mutate({
                          action: "ship",
                          sentByCourier: Boolean(order.courierName?.trim()),
                          // Pass stored values so recordSampleShipment validation passes for courier orders
                          courierName: order.courierName ?? undefined,
                          trackingId: order.trackingId ?? undefined,
                        })
                      }
                    >
                      {sampleMutation.isPending ? "Recording…" : "Mark sample shipped"}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* ── Supervisor Actions ── */}
            {showInteractiveUi && sampleGateOk && !order.sampleApprovedAt && assignedSupervisorMe && (user?.role === "SUPERVISOR" || user?.role === "ASM") && (
              <div className="border-t-2 border-violet-100 bg-gradient-to-br from-violet-50/60 via-purple-50/30 to-slate-50/40 px-5 py-5 space-y-4">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-1 rounded-full bg-violet-500" />
                  <p className="text-xs font-bold uppercase tracking-widest text-violet-700">Supervisor Actions</p>
                </div>

                {order.sampleRequested && !order.headSampleRequestApprovedAt ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4">
                    <p className="text-sm font-medium text-amber-900">Awaiting head approval</p>
                    <p className="mt-0.5 text-xs text-amber-700">The division head must approve the sample request before you can enter details.</p>
                  </div>
                ) : hasSampleDetailsSaved ? (
                  // Details already submitted — show edit shortcut instead of a blank form
                  <div className="rounded-xl border border-violet-200 bg-white/90 p-4 shadow-sm space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Sample details submitted</p>
                        <p className="mt-0.5 text-xs text-slate-500">Details have been saved. Use the Edit button to update them.</p>
                      </div>
                      {!editingSample && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditSampleDetails(order.sampleDetails ?? "");
                            setEditSampleQuantity(order.sampleQuantity ?? "");
                            setEditSampleWeight(order.sampleWeight ?? "");
                            setEditSampleRemarks((order as { sampleRemarks?: string | null }).sampleRemarks ?? "");
                            setEditCourierName(order.courierName ?? "");
                            setEditTrackingId(order.trackingId ?? "");
                            setEditSampleByCourier(order.sampleShippedByCourier ?? true);
                            setEditSampleDeliveryDate(
                              (order as { sampleDeliveryDate?: string | null }).sampleDeliveryDate
                                ? new Date((order as { sampleDeliveryDate: string }).sampleDeliveryDate).toISOString().split("T")[0]
                                : ""
                            );
                            setEditSampleError("");
                            setEditingSample(true);
                          }}
                          className="rounded-md border border-violet-200 bg-white/60 px-2.5 py-1 text-xs font-medium text-violet-700 transition-colors hover:bg-white hover:text-violet-900"
                        >
                          Edit details
                        </button>
                      )}
                    </div>
                    {editingSample ? (
                      <p className="text-xs text-slate-400">Use the edit form in the Sample details section above to update your details.</p>
                    ) : null}
                  </div>
                ) : (
                  <div className="rounded-xl border border-violet-200 bg-white/90 p-4 shadow-sm space-y-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Submit sample details</p>
                      <p className="mt-0.5 text-xs text-slate-500">Save details here — the division head will approve after reviewing.</p>
                    </div>
                    <div className="space-y-2">
                      <textarea
                        value={sampleDetails}
                        onChange={(e) => setSampleDetails(e.target.value)}
                        placeholder="Sample specifications, color, finish, fabric…"
                        rows={2}
                        className="flex min-h-[56px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
                      />
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Input value={sampleQuantity} onChange={(e) => setSampleQuantity(e.target.value)} placeholder="Quantity (e.g. 2 meters)" />
                        <Input value={sampleWeight} onChange={(e) => setSampleWeight(e.target.value)} placeholder="Weight (e.g. 250 gsm)" />
                      </div>

                      {/* Shipment method — captured here so head just approves and clicks ship */}
                      <div className="pt-1 border-t border-violet-100 space-y-2">
                        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                          <input type="checkbox" checked={sentByCourier} onChange={(e) => setSentByCourier(e.target.checked)} className="rounded" />
                          Sent by courier (requires courier name + tracking ID)
                        </label>
                        {sentByCourier && (
                          <div className="grid gap-2 sm:grid-cols-2">
                            <Input value={courierName} onChange={(e) => setCourierName(e.target.value)} placeholder="Courier name" />
                            <Input value={trackingId} onChange={(e) => setTrackingId(e.target.value)} placeholder="Tracking ID" />
                          </div>
                        )}
                        <div className="space-y-0.5">
                          <Label className="text-xs text-slate-500">Proof (optional · png/jpg/pdf, max 5MB)</Label>
                          <input type="file" accept=".png,.jpg,.jpeg,.webp,.pdf" onChange={(e) => setSampleProofFile(e.target.files?.[0] ?? null)} className="text-xs" />
                        </div>
                      </div>

                      <Button
                        type="button" variant="default" size="sm"
                        disabled={
                          sampleMutation.isPending ||
                          (!sampleDetails.trim() && !sampleQuantity.trim() && !sampleWeight.trim()) ||
                          (sentByCourier && (!courierName.trim() || !trackingId.trim()))
                        }
                        onClick={async () => {
                          try {
                            setSampleError("");
                            let proofUrl: string | undefined;
                            if (sampleProofFile) {
                              const fd = new FormData();
                              fd.append("file", sampleProofFile);
                              const res = await fetch(`/api/orders/${orderId}/sample-proof`, { method: "POST", credentials: "include", body: fd });
                              const ct = res.headers.get("content-type") ?? "";
                              const data = ct.includes("application/json") ? await res.json().catch(() => ({})) : {};
                              if (!res.ok) throw new Error((data as { error?: string }).error || `Proof upload failed (${res.status})`);
                              proofUrl = typeof (data as { url?: unknown }).url === "string" ? (data as { url: string }).url : undefined;
                            }
                            sampleMutation.mutate({
                              action: "setDetails",
                              sampleDetails: sampleDetails.trim() || undefined,
                              sampleQuantity: sampleQuantity.trim() || undefined,
                              sampleWeight: sampleWeight.trim() || undefined,
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
                        Save sample details
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Customer feedback form ── */}
            {showInteractiveUi && mightSubmitFeedback && (
              <div className="border-t-2 border-fuchsia-100 bg-gradient-to-br from-fuchsia-50/50 via-pink-50/20 to-slate-50/40 px-5 py-5 space-y-4">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-1 rounded-full bg-fuchsia-500" />
                  <p className="text-xs font-bold uppercase tracking-widest text-fuchsia-700">Customer Feedback</p>
                </div>
                <div className="rounded-xl border border-fuchsia-100 bg-white/90 p-4 shadow-sm space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Sample received date</label>
                      <input type="date" value={feedbackReceivedDate} onChange={(e) => setFeedbackReceivedDate(e.target.value)} className="flex h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-200" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Response status</label>
                      <select value={feedbackResponseStatus} onChange={(e) => setFeedbackResponseStatus(e.target.value)} className="flex h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-200">
                        <option value="">Select status…</option>
                        <option value="POSITIVE">Positive — customer interested</option>
                        <option value="NEUTRAL">Neutral — under consideration</option>
                        <option value="NEGATIVE">Negative — not proceeding</option>
                        <option value="PENDING">Pending — awaiting response</option>
                      </select>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Customer feedback <span className="normal-case text-red-400">*</span></label>
                    <textarea value={salesFeedback} onChange={(e) => setSalesFeedback(e.target.value)} placeholder="Customer reaction, sample quality remarks, follow-up needed…" rows={3} className="flex min-h-[72px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-200" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Additional remarks (optional)</label>
                    <textarea value={feedbackRemarks} onChange={(e) => setFeedbackRemarks(e.target.value)} placeholder="Any additional notes for Division Head…" rows={2} className="flex min-h-[56px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-200" />
                  </div>
                  <Button
                    type="button" size="sm"
                    disabled={sampleMutation.isPending || salesFeedback.trim().length < 5}
                    onClick={() => sampleMutation.mutate({ action: "salesFeedback", salesFeedback: salesFeedback.trim(), responseStatus: feedbackResponseStatus || undefined, remarks: feedbackRemarks.trim() || undefined, sampleReceivedAt: feedbackReceivedDate || undefined })}
                  >
                    Submit customer feedback
                  </Button>
                </div>
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Approve sample</DialogTitle>
            <DialogDescription>
              Review the submitted sample details below, then confirm to allow shipment to be recorded.
            </DialogDescription>
          </DialogHeader>

          {/* Sample details review */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 space-y-3 text-sm">
            {/* Development type */}
            {sampleDevelopment && (
              <div className="flex items-start gap-2">
                <span className="w-28 shrink-0 text-xs font-medium text-slate-500 pt-0.5">Dev type</span>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${sampleDevelopment.type === "existing" ? "bg-blue-50 text-blue-700 ring-blue-200" : "bg-violet-50 text-violet-700 ring-violet-200"}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${sampleDevelopment.type === "existing" ? "bg-blue-500" : "bg-violet-500"}`} />
                  {sampleDevelopment.type === "existing" ? "Existing development" : "New development"}
                </span>
              </div>
            )}
            {sampleDevelopment?.type === "existing" && typeof sampleDevelopment.existingReference === "string" && sampleDevelopment.existingReference.trim() && (
              <div className="flex items-start gap-2">
                <span className="w-28 shrink-0 text-xs font-medium text-slate-500 pt-0.5">Reference</span>
                <span className="text-slate-800">{sampleDevelopment.existingReference}</span>
              </div>
            )}
            {sampleDevelopment?.type === "new" && typeof sampleDevelopment.whyNewDevelopment === "string" && sampleDevelopment.whyNewDevelopment.trim() && (
              <div className="flex items-start gap-2">
                <span className="w-28 shrink-0 text-xs font-medium text-slate-500 pt-0.5">Why new</span>
                <span className="text-slate-800 whitespace-pre-wrap">{sampleDevelopment.whyNewDevelopment}</span>
              </div>
            )}
            {sampleDevelopment?.type === "new" && typeof sampleDevelopment.technicalDetails === "string" && sampleDevelopment.technicalDetails.trim() && (
              <div className="flex items-start gap-2">
                <span className="w-28 shrink-0 text-xs font-medium text-slate-500 pt-0.5">Technical</span>
                <span className="text-slate-800 whitespace-pre-wrap">{sampleDevelopment.technicalDetails}</span>
              </div>
            )}
            {/* Physical sample fields */}
            {order?.sampleDetails?.trim() && (
              <div className="flex items-start gap-2">
                <span className="w-28 shrink-0 text-xs font-medium text-slate-500 pt-0.5">Details</span>
                <span className="text-slate-800">{order.sampleDetails}</span>
              </div>
            )}
            {order?.sampleQuantity?.trim() && (
              <div className="flex items-start gap-2">
                <span className="w-28 shrink-0 text-xs font-medium text-slate-500 pt-0.5">Quantity</span>
                <span className="text-slate-800">{order.sampleQuantity}</span>
              </div>
            )}
            {order?.sampleWeight?.trim() && (
              <div className="flex items-start gap-2">
                <span className="w-28 shrink-0 text-xs font-medium text-slate-500 pt-0.5">Weight</span>
                <span className="text-slate-800">{order.sampleWeight}</span>
              </div>
            )}
            {!sampleDevelopment && !order?.sampleDetails?.trim() && !order?.sampleQuantity?.trim() && !order?.sampleWeight?.trim() && (
              <p className="text-xs text-slate-400 italic">No sample details on record.</p>
            )}
          </div>

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

      {/* ── New Development Planning Dialog ── */}
      <Dialog open={newDevDialogOpen} onOpenChange={(open) => { setNewDevDialogOpen(open); setNewDevDialogError(""); if (!open) setIsEditingDevPlan(false); }}>
        <DialogContent
          className="max-w-2xl max-h-[90vh] overflow-y-auto"
          data-gramm="false"
          data-gramm_editor="false"
          data-enable-grammarly="false"
        >
          <DialogHeader>
            <DialogTitle>{isEditingDevPlan ? "Edit Development Plan" : "New Development Planning"}</DialogTitle>
            <DialogDescription>
              {isEditingDevPlan
                ? "Update the development planning details for this enquiry."
                : "Complete planning details before assigning. SLA timer starts only after this form is submitted."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label>Development description <span className="text-red-500">*</span></Label>
              <textarea
                value={newDevDescription}
                onChange={(e) => setNewDevDescription(e.target.value)}
                rows={3}
                className="flex min-h-[72px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs"
                placeholder="Describe the new development in detail (min 10 characters)"
                {...noGrammarlyTextarea}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Required resources / materials <span className="text-red-500">*</span></Label>
              <textarea
                value={newDevResources}
                onChange={(e) => setNewDevResources(e.target.value)}
                rows={3}
                className="flex min-h-[72px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs"
                placeholder="List materials, equipment, or resources needed"
                {...noGrammarlyTextarea}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Research requirements <span className="text-slate-400 text-xs">(optional)</span></Label>
              <textarea
                value={newDevResearch}
                onChange={(e) => setNewDevResearch(e.target.value)}
                rows={2}
                className="flex min-h-[56px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs"
                placeholder="Any R&D or technical research needed"
                {...noGrammarlyTextarea}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Planning notes <span className="text-slate-400 text-xs">(optional)</span></Label>
              <textarea
                value={newDevPlanningNotes}
                onChange={(e) => setNewDevPlanningNotes(e.target.value)}
                rows={2}
                className="flex min-h-[56px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs"
                placeholder="Additional internal planning notes"
                {...noGrammarlyTextarea}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Estimated timeline <span className="text-red-500">*</span></Label>
                <Input
                  type="date"
                  value={parsePlanDate(newDevTimeline.trim()) ? newDevTimeline.trim() : ""}
                  onChange={(e) => setNewDevTimeline(e.target.value)}
                  data-gramm="false"
                  data-gramm_editor="false"
                  data-enable-grammarly="false"
                />
                <p className="text-xs text-slate-500">Target date for the estimated timeline (calendar).</p>
              </div>
              <div className="space-y-1.5">
                <Label>Expected completion <span className="text-red-500">*</span></Label>
                <Input
                  type="date"
                  value={parsePlanDate(newDevCompletionDuration.trim()) ? newDevCompletionDuration.trim() : ""}
                  onChange={(e) => setNewDevCompletionDuration(e.target.value)}
                  min={parsePlanDate(newDevTimeline.trim()) ? newDevTimeline.trim() : undefined}
                  data-gramm="false"
                  data-gramm_editor="false"
                  data-enable-grammarly="false"
                />
                <p className="text-xs text-slate-500">Expected completion date (must be on or after timeline date).</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Reason for new development <span className="text-red-500">*</span></Label>
              <textarea
                value={newDevReason}
                onChange={(e) => setNewDevReason(e.target.value)}
                rows={2}
                className="flex min-h-[56px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs"
                placeholder="Why is this a new development rather than an existing product?"
                {...noGrammarlyTextarea}
              />
            </div>
            {user && ["MANAGING_DIRECTOR", "SUPER_ADMIN"].includes(user.role) ? (
              <div className="space-y-1.5 rounded-lg border border-amber-100 bg-amber-50 p-3">
                <Label>Internal notes <span className="text-xs text-amber-700 font-normal">(visible to MD & Super Admin only)</span></Label>
                <textarea
                  value={newDevInternalNotes}
                  onChange={(e) => setNewDevInternalNotes(e.target.value)}
                  rows={2}
                  className="flex min-h-[56px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs"
                  placeholder="Confidential planning notes"
                  {...noGrammarlyTextarea}
                />
              </div>
            ) : null}
            {newDevDialogError ? <p className="text-sm text-red-600">{newDevDialogError}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setNewDevDialogOpen(false); setNewDevDialogError(""); setIsEditingDevPlan(false); }}>Cancel</Button>
            <Button
              type="button"
              disabled={(() => {
                const td = parsePlanDate(newDevTimeline.trim());
                const cd = parsePlanDate(newDevCompletionDuration.trim());
                return (
                  editDevPlanSaving ||
                  newDevDescription.trim().length < 10 ||
                  !newDevResources.trim() ||
                  !td ||
                  !cd ||
                  cd < td ||
                  !newDevReason.trim()
                );
              })()}
              onClick={async () => {
                const timeline = newDevTimeline.trim();
                const completion = newDevCompletionDuration.trim();
                const td = parsePlanDate(timeline);
                const cd = parsePlanDate(completion);
                if (!td || !cd) {
                  setNewDevDialogError("Please choose a valid date for both timeline and expected completion.");
                  return;
                }
                if (cd < td) {
                  setNewDevDialogError("Expected completion date must be on or after the estimated timeline date.");
                  return;
                }
                const planPayload = {
                  description: newDevDescription.trim(),
                  resourcesRequired: newDevResources.trim(),
                  researchRequirements: newDevResearch.trim() || undefined,
                  planningNotes: newDevPlanningNotes.trim() || undefined,
                  estimatedTimeline: timeline,
                  expectedCompletionDuration: completion,
                  internalNotes: newDevInternalNotes.trim() || undefined,
                  reasonForNewDevelopment: newDevReason.trim(),
                };
                if (isEditingDevPlan) {
                  // Save via PATCH (editing existing plan)
                  setEditDevPlanSaving(true);
                  setNewDevDialogError("");
                  try {
                    const res = await fetch(`/api/orders/${orderId}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      credentials: "include",
                      body: JSON.stringify({ newDevPlan: planPayload }),
                    });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) throw new Error((data as { error?: string }).error || "Save failed");
                    setNewDevDialogOpen(false);
                    setIsEditingDevPlan(false);
                    setNewDevDialogError("");
                    queryClient.invalidateQueries({ queryKey: ["order", orderId] });
                  } catch (e) {
                    setNewDevDialogError(e instanceof Error ? e.message : "Save failed");
                  } finally {
                    setEditDevPlanSaving(false);
                  }
                } else {
                  // Store pending plan (initial handoff creation)
                  setPendingNewDevPlan(planPayload);
                  setNewDevDialogError("");
                  setNewDevDialogOpen(false);
                }
              }}
            >
              {editDevPlanSaving ? "Saving…" : isEditingDevPlan ? "Save changes" : "Confirm planning details"}
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
