"use client";

import { use } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useMemo, useEffect } from "react";
import { formatEnquiryNumber, formatEnquiryNumberShort } from "@/lib/enquiry-display";
import { NewDevelopmentModal } from "@/components/new-development-modal";
import { ArrowRightLeft, Check, CircleDot, Download, Eye, FileText, X } from "lucide-react";

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "success" | "warning"> = {
  PLACED: "secondary",
  IN_PROGRESS: "default",
  TRANSFERRED: "warning",
  REJECTED: "destructive",
  COMPLETED: "success",
  CANCELLED: "secondary",
};

/** Visual emphasis for placed date: SLA-aware when deadline exists, otherwise a stable accent. */
function placedDateClass(order: { status: string; slaDeadline?: string | null; createdAt: string }): string {
  const terminal = order.status === "COMPLETED" || order.status === "REJECTED" || order.status === "CANCELLED";
  if (terminal) return "text-slate-600";

  if (order.slaDeadline) {
    const deadline = new Date(order.slaDeadline).getTime();
    const now = Date.now();
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
  user: { name: string; email: string; role?: string | null } | null;
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
  currentDivisionId?: number;
  companyName: string | null;
  description: string | null;
  customFields: Record<string, unknown> | null;
  transferCount: number;
  rejectionCount?: number;
  slaDeadline: string | null;
  sampleRequested: boolean;
  sampleRequestNotes: string | null;
  customerId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  customerGstNumber?: string | null;
  customerGstCert?: unknown;
  customerOrderDate?: string | null;
  productKind?: string | null;
  existingProductRef?: string | null;
  existingSampleInfo?: string | null;
  existingInternalRemarks?: string | null;
  planningStartedAt?: string | null;
  planningCompletedAt?: string | null;
  newDevDescription?: string | null;
  newDevResources?: string | null;
  newDevRandD?: string | null;
  newDevTimeline?: string | null;
  newDevNotes?: string | null;
  newDevCompletionDuration?: string | null;
  newDevWhyNeeded?: string | null;
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
  transfers?: Array<{
    id?: number;
    createdAt: string;
    reason?: string | null;
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

type AuditUiOpts = { hideSlaTimingCopy?: boolean };

function auditPayloadSummary(action: string, payload: unknown, opts?: AuditUiOpts): string {
  if (!payload || typeof payload !== "object") return "";
  const p = payload as Record<string, unknown>;
  switch (action) {
    case "OrderAccepted":
      return p.reason ? `Remarks: ${String(p.reason)}` : "";
    case "OrderTransferred":
      return p.reason ? `Reason: ${String(p.reason)}` : "";
    case "OrderRejected":
      return p.reason ? `Reason: ${String(p.reason)}` : "";
    case "OrderCancelled":
      return p.reason ? `Reason: ${String(p.reason)}` : "";
    case "ProductClassified":
      return p.kind ? `Kind: ${String(p.kind)}` : "";
    case "NewDevelopmentPlanSubmitted":
      return "Planning popup submitted";
    case "PlanningCompleted":
      if (opts?.hideSlaTimingCopy) return "";
      return p.slaDeadline ? `SLA starts: ${new Date(String(p.slaDeadline)).toLocaleString()}` : "";
    case "SupervisorHandoffSubmitted":
      return p.remarks ? `Remarks: ${String(p.remarks)}` : "";
    case "OrderCompleted":
      return p.durationMs != null ? `Elapsed: ${Math.round(Number(p.durationMs) / 1000)}s` : "";
    case "SLABreachHeadRejectionSubmitted":
      return p.message ? `Message: ${String(p.message)}` : "";
    default:
      return "";
  }
}

function auditActionLabel(action: string, opts?: AuditUiOpts): string {
  function prettify(raw: string): string {
    // Handle SCREAMING_SNAKE_CASE → "Screaming snake case"
    const withSpaces = raw
      .replace(/_/g, " ")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .trim();
    if (!withSpaces) return raw;
    // Title-case words but keep common acronyms.
    return withSpaces
      .split(/\s+/)
      .map((w) => {
        const upper = w.toUpperCase();
        if (["SLA", "GST", "R&D", "RND", "MD", "ASM"].includes(upper)) return upper === "RND" ? "R&D" : upper;
        return w.slice(0, 1).toUpperCase() + w.slice(1).toLowerCase();
      })
      .join(" ");
  }

  const m: Record<string, string> = {
    OrderCreated: "Enquiry placed",
    OrderAccepted: "Accepted by division",
    OrderTransferred: "Transferred",
    OrderRejected: "Rejected",
    OrderCancelled: "Cancelled by submitter",
    OrderReceived: "Received in new division",
    ProductClassified: "Product classified",
    NewDevelopmentPlanSubmitted: "New development plan submitted",
    PlanningCompleted: "Planning completed (SLA started)",
    SupervisorHandoffSubmitted: "Submitted to supervisor",
    OrderCompleted: "Completed",
    SampleDetailsUpdated: "Sample details updated",
    SampleDevelopmentUpdated: "Sample type / development details",
    SampleApproved: "Sample approved",
    SampleShipped: "Sample sent / shipped",
    SalesFeedbackRecorded: "Sales / user response",
    SLABreachDetected: "SLA breach",
    SLABreachHeadRejectionSubmitted: "SLA head rejection submitted",

    // Legacy / older action codes that may exist in existing audit logs.
    ORDERENQUIRYHANDOFFSUBMITTED: "Submitted to supervisor",
    SAMPLEHEADREQUESTAPPROVED: "Sample request approved by Division Head",
  };
  if (opts?.hideSlaTimingCopy) {
    m.PlanningCompleted = "Planning completed";
    m.SLABreachDetected = "Response deadline passed";
    m.SLABreachHeadRejectionSubmitted = "Division head response recorded";
  }
  return m[action] ?? prettify(action);
}

function formatCustomFieldValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

// (Detailed timeline styles removed; timeline now renders as a compact "Workflow timeline" list.)

// Enquiry pipeline strip removed per UI requirement.

// sample proof preview helpers removed (sample workflow UI removed).

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const orderId = Number(id);
  const searchParams = useSearchParams();
  const isAuditView = searchParams.get("from") === "audit";
  const showInteractiveUi = !isAuditView;
  const { user } = useAuth();
  /** Division Head / Supervisor / ASM: do not surface SLA duration or “48-hour” style wording on this page. */
  const hideSlaTimingCopy =
    user?.role === "MANAGER" || user?.role === "SUPERVISOR" || user?.role === "ASM";
  const queryClient = useQueryClient();
  const [gstPreviewOpen, setGstPreviewOpen] = useState(false);
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [acceptReason, setAcceptReason] = useState("");
  const [transferReason, setTransferReason] = useState("");
  const [toDivisionId, setToDivisionId] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelError, setCancelError] = useState("");
  const [actionError, setActionError] = useState("");
  // Sample workflow UI removed.
  // Sample "new development details" dialogs removed (sample workflow UI removed).
  const [slaHeadRejectionMessage, setSlaHeadRejectionMessage] = useState("");
  const [slaHeadRejectionError, setSlaHeadRejectionError] = useState("");

  // Phase 2: division workflow
  const [productKindDraft, setProductKindDraft] = useState<"EXISTING" | "NEW">("EXISTING");
  const [existingProductRef, setExistingProductRef] = useState("");
  const [existingSampleInfo, setExistingSampleInfo] = useState("");
  const [existingInternalRemarks, setExistingInternalRemarks] = useState("");
  const [handoffRemarks, setHandoffRemarks] = useState("");
  const [handoffError, setHandoffError] = useState("");
  const [planningOpen, setPlanningOpen] = useState(false);
  const [supSampleDetails, setSupSampleDetails] = useState("");
  const [supSampleQty, setSupSampleQty] = useState("");
  const [supSampleWeight, setSupSampleWeight] = useState("");
  const [supByCourier, setSupByCourier] = useState(true);
  const [supCourierName, setSupCourierName] = useState("");
  const [supTrackingId, setSupTrackingId] = useState("");
  const [supSampleError, setSupSampleError] = useState("");

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
    enabled: Number.isInteger(orderId),
    staleTime: 60_000,
  });

  const auditLogsAsc = useMemo(() => (auditData?.logs ? [...auditData.logs].reverse() : []), [auditData]);
  const auditLogsDesc = useMemo(() => (auditData?.logs ? [...auditData.logs] : []), [auditData]);

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
        body: JSON.stringify({ toDivisionId: Number(toDivisionId), reason: transferReason }),
      }),
    onSuccess: (res) => {
      if (res.ok) {
        setTransferOpen(false);
        setTransferReason("");
        setToDivisionId("");
        queryClient.invalidateQueries({ queryKey: ["order", orderId] });
        queryClient.invalidateQueries({ queryKey: ["order-audit", orderId] });
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
        queryClient.invalidateQueries({ queryKey: ["order-audit", orderId] });
        queryClient.invalidateQueries({ queryKey: ["orders"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      }
    },
  });

  const classifyMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch(`/api/orders/${orderId}/classify-product`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || "Classification failed");
      return data as { requiresPlanningPopup?: boolean };
    },
    onSuccess: (data) => {
      setActionError("");
      queryClient.invalidateQueries({ queryKey: ["order", orderId] });
      queryClient.invalidateQueries({ queryKey: ["order-audit", orderId] });
      if (data?.requiresPlanningPopup) setPlanningOpen(true);
    },
    onError: (err: Error) => setActionError(err.message),
  });

  const handoffMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/orders/${orderId}/submit-to-supervisor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ remarks: handoffRemarks }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || "Handoff failed");
      return data;
    },
    onSuccess: () => {
      setHandoffError("");
      setHandoffRemarks("");
      queryClient.invalidateQueries({ queryKey: ["order", orderId] });
      queryClient.invalidateQueries({ queryKey: ["order-audit", orderId] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notifications-unread-count"] });
    },
    onError: (err: Error) => setHandoffError(err.message),
  });

  const supervisorSampleMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/orders/${orderId}/supervisor-sample-dispatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          sampleDetails: supSampleDetails.trim(),
          sampleQuantity: supSampleQty.trim(),
          sampleWeight: supSampleWeight.trim(),
          sentByCourier: supByCourier,
          courierName: supCourierName.trim(),
          trackingId: supTrackingId.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error || "Could not save sample dispatch");
      return data;
    },
    onSuccess: () => {
      setSupSampleError("");
      queryClient.invalidateQueries({ queryKey: ["order", orderId] });
      queryClient.invalidateQueries({ queryKey: ["order-audit", orderId] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notifications-unread-count"] });
    },
    onError: (err: Error) => setSupSampleError(err.message),
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
    mutationFn: () => fetch(`/api/orders/${orderId}/receive`, { method: "POST", credentials: "include" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order", orderId] });
      queryClient.invalidateQueries({ queryKey: ["order-audit", orderId] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
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
  // const isClosedStatus = hasStatus && ["REJECTED", "COMPLETED", "CANCELLED"].includes(status);
  // Sample workflow actions removed.

  useEffect(() => {
    if (!order?.sampleRequested) return;
    const cf = order.customFields;
    if (!cf || typeof cf !== "object") return;
    const sd = (cf as Record<string, unknown>).sampleDevelopment;
    if (!sd || typeof sd !== "object") return;
    // sample development parsing removed (UI removed)
  }, [order?.id, order?.customFields, order?.sampleRequested]);

  useEffect(() => {
    if (!order) return;
    if (typeof order.productKind === "string" && (order.productKind === "EXISTING" || order.productKind === "NEW")) {
      setProductKindDraft(order.productKind);
    }
    if (typeof order.existingProductRef === "string") setExistingProductRef(order.existingProductRef);
    if (typeof order.existingSampleInfo === "string") setExistingSampleInfo(order.existingSampleInfo);
    if (typeof order.existingInternalRemarks === "string") setExistingInternalRemarks(order.existingInternalRemarks);
  }, [order, order?.id, order?.productKind, order?.existingProductRef, order?.existingSampleInfo, order?.existingInternalRemarks]);

  type GstCert = { filename?: string; mimeType?: string; base64?: string; size?: number; uploadedAt?: string };
  const gstCert: GstCert | null = useMemo(() => {
    const raw = order?.customerGstCert;
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    if (typeof r.base64 !== "string" || typeof r.mimeType !== "string") return null;
    return {
      filename: typeof r.filename === "string" ? r.filename : "gst-certificate",
      mimeType: r.mimeType,
      base64: r.base64,
      size: typeof r.size === "number" ? r.size : undefined,
      uploadedAt: typeof r.uploadedAt === "string" ? r.uploadedAt : undefined,
    };
  }, [order?.customerGstCert]);

  const gstObjectUrl = useMemo(() => {
    if (!gstCert?.base64 || !gstCert.mimeType) return null;
    try {
      const bin = atob(gstCert.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: gstCert.mimeType });
      return URL.createObjectURL(blob);
    } catch {
      return null;
    }
  }, [gstCert?.base64, gstCert?.mimeType]);

  useEffect(() => {
    return () => {
      if (gstObjectUrl) URL.revokeObjectURL(gstObjectUrl);
    };
  }, [gstObjectUrl]);

  const isEnquirySubmitter = Boolean(order && user && Number(user.id) === order.createdById);
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

  const canRunDivisionWorkflow =
    showInteractiveUi &&
    order &&
    user &&
    ["MANAGER", "SUPER_ADMIN", "MANAGING_DIRECTOR"].includes(user.role) &&
    order.status === "IN_PROGRESS";

  const productKind = order?.productKind === "EXISTING" || order?.productKind === "NEW" ? order.productKind : null;
  const planningDone = Boolean(order?.planningCompletedAt);
  const canHandoff =
    canRunDivisionWorkflow &&
    Boolean(productKind) &&
    (productKind === "EXISTING"
      ? Boolean(order?.existingProductRef?.trim())
      : Boolean(productKind === "NEW" && planningDone));

  const supervisorHandoffPayload = useMemo(() => {
    if (!order?.customFields || typeof order.customFields !== "object") return null;
    const raw = (order.customFields as Record<string, unknown>).supervisorHandoff;
    if (!raw || typeof raw !== "object") return null;
    return raw as Record<string, unknown>;
  }, [order?.customFields]);

  const otherCustomFieldEntries = useMemo(() => {
    if (!order?.customFields || typeof order.customFields !== "object") return [];
    return Object.entries(order.customFields as Record<string, unknown>).filter(
      ([k]) => k !== "supervisorHandoff" && k !== "sampleDevelopment"
    );
  }, [order?.customFields]);

  const sampleDevelopmentRaw = useMemo(() => {
    if (!order?.customFields || typeof order.customFields !== "object") return null;
    const sd = (order.customFields as Record<string, unknown>).sampleDevelopment;
    return sd && typeof sd === "object" ? sd : null;
  }, [order?.customFields]);

  const canSupervisorSubmitSample =
    showInteractiveUi &&
    !!order &&
    user?.role === "SUPERVISOR" &&
    typeof user.divisionId === "number" &&
    Number(user.divisionId) === Number(order.currentDivision?.id) &&
    order.sampleRequested &&
    order.status === "IN_PROGRESS" &&
    !order.sampleShippedAt;

  useEffect(() => {
    if (!order?.id || order.sampleShippedAt) return;
    setSupSampleDetails(order.sampleDetails?.trim() ?? "");
    setSupSampleQty(order.sampleQuantity?.trim() ?? "");
    setSupSampleWeight(order.sampleWeight?.trim() ?? "");
    setSupByCourier(order.sampleShippedByCourier !== false);
    setSupCourierName(order.courierName?.trim() ?? "");
    setSupTrackingId(order.trackingId?.trim() ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reset form for a new order id / shipped gate
  }, [order?.id, order?.sampleShippedAt]);

  // sampleDevelopment removed (sample workflow UI removed).

  // sampleDevelopmentUpdatedAtLabel removed (sample workflow UI removed).

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
            className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-900 px-3 py-1 text-base font-extrabold tracking-tight text-white shadow-sm shadow-slate-900/15"
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
            className={`font-semibold tabular-nums ${placedDateClass(order)}`}
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

      <Card className="border-slate-200/80 bg-gradient-to-b from-slate-50/70 via-white to-white shadow-sm ring-1 ring-slate-900/5">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
          <CardTitle className="text-slate-900">Enquiry details</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            {canAct && showInteractiveUi && (
              <>
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
                <Button variant="outline" onClick={() => setTransferOpen(true)}>
                  Transfer
                </Button>
                {canRejectEnquiry && (
                  <Button variant="destructive" onClick={() => setRejectOpen(true)}>
                    Reject
                  </Button>
                )}
              </>
            )}
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
        </CardHeader>
        <CardContent className="space-y-4">
          {actionError && canAct && showInteractiveUi && (
            <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
              {actionError}
            </p>
          )}
          {(order.customerId || order.customerName || order.customerGstNumber || gstCert) && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm ring-1 ring-slate-900/5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <FileText className="h-4 w-4 text-slate-500" />
                    Customer &amp; GST
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Customer identifiers and GST certificate attached to this enquiry.
                  </p>
                </div>

                {gstCert && gstObjectUrl ? (
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <Button asChild size="sm" variant="outline">
                      <a href={gstObjectUrl} target="_blank" rel="noreferrer">
                        <Eye className="mr-2 h-4 w-4" />
                        Open
                      </a>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <a href={gstObjectUrl} download={gstCert.filename ?? "gst-certificate"}>
                        <Download className="mr-2 h-4 w-4" />
                        Download
                      </a>
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-slate-600 hover:text-slate-900"
                      onClick={() => setGstPreviewOpen((v) => !v)}
                    >
                      {gstPreviewOpen ? "Hide preview" : "Preview"}
                    </Button>
                  </div>
                ) : null}
              </div>

              <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
                  <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Customer ID</dt>
                  <dd className="mt-0.5 font-mono text-slate-900">{order.customerId ?? "—"}</dd>
                </div>
                <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
                  <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Customer name</dt>
                  <dd className="mt-0.5 text-slate-900">{order.customerName ?? "—"}</dd>
                </div>
                <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
                  <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Phone</dt>
                  <dd className="mt-0.5 text-slate-900">{order.customerPhone ?? "—"}</dd>
                </div>
                <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
                  <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">GST number</dt>
                  <dd className="mt-0.5 font-mono text-slate-900">{order.customerGstNumber ?? "—"}</dd>
                </div>
                <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 sm:col-span-2">
                  <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Order date</dt>
                  <dd className="mt-0.5 text-slate-900">
                    {order.customerOrderDate ? new Date(order.customerOrderDate).toLocaleDateString() : "—"}
                  </dd>
                </div>
              </dl>

              {gstCert && gstObjectUrl ? (
                <div className="mt-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
                    <p className="text-xs text-slate-600">
                      <span className="font-medium text-slate-900">{gstCert.filename ?? "GST certificate"}</span>
                      {gstCert.mimeType ? <span className="text-slate-400"> · {gstCert.mimeType}</span> : null}
                      {gstCert.size ? <span className="text-slate-400"> · {(gstCert.size / 1024).toFixed(1)} KB</span> : null}
                    </p>
                    {!gstPreviewOpen ? (
                      <p className="text-[11px] text-slate-500">Preview is hidden</p>
                    ) : null}
                  </div>

                  {gstPreviewOpen ? (
                    <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white">
                      {gstCert.mimeType?.startsWith("image/") ? (
                        // eslint-disable-next-line @next/next/no-img-element -- inline DB attachment preview
                        <img
                          src={gstObjectUrl}
                          alt="GST certificate"
                          className="max-h-[40rem] w-full object-contain"
                        />
                      ) : gstCert.mimeType === "application/pdf" ? (
                        <iframe
                          title="GST certificate"
                          src={gstObjectUrl}
                          className="h-[40rem] w-full bg-white"
                        />
                      ) : (
                        <p className="p-4 text-sm text-slate-600">Preview is not available for this file type.</p>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : gstCert ? (
                <p className="mt-3 text-xs text-amber-700">GST attachment present but could not be previewed.</p>
              ) : null}
            </div>
          )}
          <p>
            <span className="text-slate-500">Company name:</span>{" "}
            {order.companyName?.trim() ? order.companyName : "—"}
          </p>
          <p>
            <span className="text-slate-500">Product description:</span>{" "}
            {order.description?.trim() ? order.description : "—"}
          </p>
          <p>
            <span className="text-slate-500">Created by:</span> {order.createdBy?.name} ({order.createdBy?.email})
          </p>
          {order.status === "CANCELLED" && order.cancellationReason ? (
            <div className="rounded-lg border border-stone-200 bg-stone-50/90 p-3 text-sm">
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

          {supervisorHandoffPayload ? (
            <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-3 text-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-700">
                Division head → supervisor
              </p>
              <p className="mt-2 text-slate-800">
                <span className="text-slate-500">Remarks:</span>{" "}
                {typeof supervisorHandoffPayload.remarks === "string" ? supervisorHandoffPayload.remarks : "—"}
              </p>
              <p className="mt-1 text-xs text-slate-600">
                {typeof supervisorHandoffPayload.submittedAt === "string" ? (
                  <>Submitted {new Date(String(supervisorHandoffPayload.submittedAt)).toLocaleString()}</>
                ) : null}
                {typeof supervisorHandoffPayload.kind === "string" ? (
                  <> · Product kind: {String(supervisorHandoffPayload.kind)}</>
                ) : null}
              </p>
            </div>
          ) : null}

          {order.sampleRequested &&
          (order.sampleDetails?.trim() ||
            order.sampleQuantity?.trim() ||
            order.sampleWeight?.trim() ||
            order.sampleShippedAt) ? (
            <div className="rounded-lg border border-emerald-100 bg-emerald-50/40 p-3 text-sm space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800">Sample fulfilment</p>
              {order.sampleDetails?.trim() ? (
                <p>
                  <span className="text-slate-500">Sample details:</span>{" "}
                  <span className="whitespace-pre-wrap text-slate-900">{order.sampleDetails}</span>
                </p>
              ) : null}
              {order.sampleQuantity?.trim() ? (
                <p>
                  <span className="text-slate-500">Quantity:</span> {order.sampleQuantity}
                </p>
              ) : null}
              {order.sampleWeight?.trim() ? (
                <p>
                  <span className="text-slate-500">Weight:</span> {order.sampleWeight}
                </p>
              ) : null}
              {order.sampleShippedAt ? (
                <>
                  <p>
                    <span className="text-slate-500">Dispatched:</span>{" "}
                    {new Date(order.sampleShippedAt).toLocaleString()}
                  </p>
                  <p>
                    <span className="text-slate-500">By courier:</span>{" "}
                    {order.sampleShippedByCourier === false ? "No (hand delivered / other)" : "Yes"}
                  </p>
                  {order.sampleShippedByCourier !== false && (order.courierName || order.trackingId) ? (
                    <p>
                      <span className="text-slate-500">Courier:</span> {order.courierName ?? "—"} ·{" "}
                      <span className="text-slate-500">Tracking:</span> {order.trackingId ?? "—"}
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="text-xs text-amber-800">Dispatch not recorded yet.</p>
              )}
            </div>
          ) : null}

          {canSupervisorSubmitSample ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3 ring-1 ring-slate-900/5">
              <p className="text-sm font-semibold text-slate-900">Record sample dispatch</p>
              <p className="text-xs text-slate-500">
                Enter how the sample was prepared and sent. Division head and the salesperson who raised the enquiry
                will see this here and in the activity log.
              </p>
              <div className="space-y-2">
                <Label htmlFor="supSampleDetails">Sample details (required, min 10 characters)</Label>
                <textarea
                  id="supSampleDetails"
                  rows={4}
                  value={supSampleDetails}
                  onChange={(e) => setSupSampleDetails(e.target.value)}
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
                  placeholder="Fabric / colour / size, batch notes, packaging, etc."
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="supQty">Quantity (optional)</Label>
                  <Input
                    id="supQty"
                    value={supSampleQty}
                    onChange={(e) => setSupSampleQty(e.target.value)}
                    placeholder="e.g. 2 metres"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="supWt">Weight (optional)</Label>
                  <Input
                    id="supWt"
                    value={supSampleWeight}
                    onChange={(e) => setSupSampleWeight(e.target.value)}
                    placeholder="e.g. 250 g"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="supByCourier"
                  type="checkbox"
                  checked={supByCourier}
                  onChange={(e) => setSupByCourier(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                <Label htmlFor="supByCourier" className="text-sm font-normal cursor-pointer">
                  Sent by courier (uncheck if hand-delivered or non-courier dispatch)
                </Label>
              </div>
              {supByCourier ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="supCourier">Courier name</Label>
                    <Input
                      id="supCourier"
                      value={supCourierName}
                      onChange={(e) => setSupCourierName(e.target.value)}
                      placeholder="e.g. BlueDart"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="supTrack">Tracking / AWB</Label>
                    <Input
                      id="supTrack"
                      value={supTrackingId}
                      onChange={(e) => setSupTrackingId(e.target.value)}
                      placeholder="Waybill number"
                    />
                  </div>
                </div>
              ) : null}
              {supSampleError ? <p className="text-xs text-red-700">{supSampleError}</p> : null}
              <Button
                type="button"
                size="sm"
                disabled={
                  supervisorSampleMutation.isPending ||
                  supSampleDetails.trim().length < 10 ||
                  (supByCourier && (!supCourierName.trim() || !supTrackingId.trim()))
                }
                onClick={() => {
                  setSupSampleError("");
                  supervisorSampleMutation.mutate();
                }}
              >
                {supervisorSampleMutation.isPending ? "Saving…" : "Save & record dispatch"}
              </Button>
            </div>
          ) : null}

          {order.customFields &&
          typeof order.customFields === "object" &&
          (otherCustomFieldEntries.length > 0 || sampleDevelopmentRaw) ? (
            <div>
              <span className="text-slate-500">Custom fields:</span>
              <ul className="mt-1 list-inside list-disc text-sm space-y-1">
                {sampleDevelopmentRaw ? (
                  <li key="sampleDevelopment" className="list-none -ml-4 sm:-ml-6">
                    <span className="font-medium">sampleDevelopment:</span>
                    <pre className="mt-1 max-h-40 overflow-auto rounded border border-slate-100 bg-slate-50 p-2 text-xs">
                      {formatCustomFieldValue(sampleDevelopmentRaw)}
                    </pre>
                  </li>
                ) : null}
                {otherCustomFieldEntries.map(([k, v]) => (
                  <li key={k}>
                    <span className="font-medium">{k}:</span>{" "}
                    <span className="whitespace-pre-wrap break-words">{formatCustomFieldValue(v)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {order.slaDeadline && (
            <p>
              <span className="text-slate-500">{hideSlaTimingCopy ? "Due by:" : "SLA deadline:"}</span>{" "}
              {new Date(order.slaDeadline).toLocaleString()}
            </p>
          )}
          {openSlaBreach ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-sm">
              <p className="font-medium text-amber-950">
                {hideSlaTimingCopy ? "Response deadline passed" : "SLA breach recorded"}
              </p>
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
            <p>
              <span className="text-slate-500">Transfers:</span> {order.transferCount} ·{" "}
              <span className="text-slate-500">
                {isEnquirySubmitter ? "Declined by division:" : "Rejections:"}
              </span>{" "}
              {order.rejectionCount}
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

      {/* Enquiry pipeline removed per UI requirement. */}

      {isAuditView && (
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
                  const extra = auditPayloadSummary(log.action, log.payload, { hideSlaTimingCopy });
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
                          {hideSlaTimingCopy ? auditActionLabel(log.action, { hideSlaTimingCopy }) : log.action}
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

      {/* Sample workflow section removed per UI requirement. */}

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
                  {t.reason ?? "—"} ({new Date(t.createdAt).toLocaleString()})
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

      {/* Standalone Actions card removed (buttons moved into Enquiry details). */}

      {canRunDivisionWorkflow && (
        <Card>
          <CardHeader>
            <CardTitle>Division workflow (required)</CardTitle>
            <p className="text-sm text-slate-500 font-normal">
              Accept → classify (Existing / New Development) → submit to Supervisor with remarks.
            </p>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="relative rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50/40 p-5 space-y-4 ring-1 ring-slate-900/5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Step 1
                  </p>
                  <h3 className="mt-0.5 text-base font-semibold tracking-tight text-slate-900">
                    Classify product
                  </h3>
                </div>
                {productKind ? (
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${
                      productKind === "NEW"
                        ? "bg-blue-50 text-blue-700 ring-1 ring-blue-100"
                        : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
                    }`}
                  >
                    {productKind === "NEW" ? "New Development" : "Existing Product"}
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700 ring-1 ring-amber-100">
                    Pending classification
                  </span>
                )}
              </div>

              <p className="text-sm text-slate-600">
                Pick how this enquiry should proceed. <strong>Existing product</strong> follows the standard path.
                <strong className="ml-1">New development</strong> opens the planning popup to capture planning details.
              </p>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setProductKindDraft("EXISTING")}
                  className={`group rounded-xl border px-4 py-2.5 text-left text-sm transition-all ${
                    productKindDraft === "EXISTING"
                      ? "border-slate-900 bg-slate-900 text-white shadow-sm"
                      : "border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <span className="block text-[11px] uppercase tracking-wider opacity-70">Option A</span>
                  <span className="block font-semibold">Existing product</span>
                </button>
                <button
                  type="button"
                  onClick={() => setProductKindDraft("NEW")}
                  className={`group rounded-xl border px-4 py-2.5 text-left text-sm transition-all ${
                    productKindDraft === "NEW"
                      ? "border-slate-900 bg-slate-900 text-white shadow-sm"
                      : "border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <span className="block text-[11px] uppercase tracking-wider opacity-70">Option B</span>
                  <span className="block font-semibold">New development</span>
                </button>
              </div>

              {productKindDraft === "EXISTING" ? (
                <div className="grid grid-cols-1 gap-3">
                  <div className="space-y-2">
                    <Label className="font-semibold text-slate-900">Existing product reference (required)</Label>
                    <textarea
                      value={existingProductRef}
                      onChange={(e) => setExistingProductRef(e.target.value)}
                      rows={2}
                      className="w-full rounded-md border border-amber-300 bg-amber-50/40 px-3 py-2 text-sm shadow-sm outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400"
                      placeholder="Style / ref / previous enquiry number..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Existing sample info (optional)</Label>
                    <textarea
                      value={existingSampleInfo}
                      onChange={(e) => setExistingSampleInfo(e.target.value)}
                      rows={2}
                      className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                      placeholder="Any existing sample details..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Internal remarks (optional)</Label>
                    <textarea
                      value={existingInternalRemarks}
                      onChange={(e) => setExistingInternalRemarks(e.target.value)}
                      rows={3}
                      className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                      placeholder="Notes for supervisor/head..."
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={classifyMutation.isPending || existingProductRef.trim().length < 5}
                    onClick={() =>
                      classifyMutation.mutate({
                        kind: "EXISTING",
                        existingProductRef,
                        existingSampleInfo,
                        existingInternalRemarks,
                      })
                    }
                  >
                    {classifyMutation.isPending ? "Saving…" : "Save classification"}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3 rounded-xl border border-blue-100 bg-blue-50/40 p-4">
                  <Button
                    type="button"
                    size="sm"
                    className="bg-slate-900 text-white hover:bg-slate-800"
                    disabled={classifyMutation.isPending}
                    onClick={() => {
                      setActionError("");
                      // If already classified as NEW, just open the planning popup immediately.
                      if (productKind === "NEW") {
                        setPlanningOpen(true);
                        return;
                      }
                      // Otherwise classify as NEW first; open the modal on success OR show error.
                      classifyMutation.mutate(
                        { kind: "NEW" },
                        {
                          onSuccess: () => setPlanningOpen(true),
                          onError: (err: Error) => setActionError(err.message),
                        }
                      );
                    }}
                  >
                    {classifyMutation.isPending ? "Starting…" : "Start New Development planning"}
                  </Button>
                  {productKind === "NEW" ? (
                    <p className="text-[11px] text-slate-500">
                      Already classified. Click the button to reopen the planning popup.
                    </p>
                  ) : null}

                  {productKind === "NEW" ? (
                    <div className="rounded-lg border border-slate-200 bg-white p-3">
                      <p className="text-slate-700">
                        Planning status:{" "}
                        {planningDone ? (
                          <span className="font-medium text-emerald-700">Completed</span>
                        ) : (
                          <span className="font-medium text-amber-700">Pending</span>
                        )}
                      </p>
                      {!planningDone ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Button type="button" size="sm" variant="outline" onClick={() => setPlanningOpen(true)}>
                            Open planning popup…
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            disabled={classifyMutation.isPending}
                            onClick={async () => {
                              const res = await fetch(`/api/orders/${orderId}/complete-planning`, {
                                method: "POST",
                                credentials: "include",
                              });
                              if (!res.ok) {
                                const j = (await res.json().catch(() => ({}))) as { error?: string };
                                setActionError(j.error ?? `Could not complete planning (${res.status})`);
                                return;
                              }
                              setActionError("");
                              queryClient.invalidateQueries({ queryKey: ["order", orderId] });
                              queryClient.invalidateQueries({ queryKey: ["order-audit", orderId] });
                            }}
                          >
                            Mark planning complete
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 ring-1 ring-slate-900/5">
              <p className="text-sm font-medium text-slate-900">Step 2 — Submit to Supervisor</p>
              <p className="text-xs text-slate-500">
                Mandatory remarks. Supervisor (and Head/ASM) will see this in the enquiry timeline.
              </p>
              <div className="space-y-2">
                <Label className="font-semibold text-slate-900">Remarks (min 10 characters) (required)</Label>
                <textarea
                  value={handoffRemarks}
                  onChange={(e) => setHandoffRemarks(e.target.value)}
                  rows={4}
                  className="w-full rounded-md border border-amber-300 bg-amber-50/40 px-3 py-2 text-sm shadow-sm outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400"
                  placeholder="What the supervisor should do next, notes, constraints..."
                />
              </div>
              {handoffError ? <p className="text-xs text-red-700">{handoffError}</p> : null}
              <Button
                type="button"
                size="sm"
                disabled={handoffMutation.isPending || !canHandoff || handoffRemarks.trim().length < 10}
                onClick={() => {
                  setHandoffError("");
                  handoffMutation.mutate();
                }}
              >
                {handoffMutation.isPending ? "Submitting…" : "Submit to supervisor"}
              </Button>
              {!canHandoff ? (
                <p className="text-xs text-amber-700">
                  Complete classification first{productKind === "NEW" ? " (and mark planning complete)" : ""}.
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      )}

      <NewDevelopmentModal
        enquiryId={orderId}
        open={planningOpen}
        onOpenChange={setPlanningOpen}
        initial={{
          newDevDescription: typeof order?.newDevDescription === "string" ? order.newDevDescription : "",
          newDevResources: typeof order?.newDevResources === "string" ? order.newDevResources : "",
          newDevRandD: typeof order?.newDevRandD === "string" ? order.newDevRandD : "",
          newDevTimeline: typeof order?.newDevTimeline === "string" ? order.newDevTimeline : "",
          newDevNotes: typeof order?.newDevNotes === "string" ? order.newDevNotes : "",
          newDevCompletionDuration:
            typeof order?.newDevCompletionDuration === "string" ? order.newDevCompletionDuration : "",
          newDevWhyNeeded: typeof order?.newDevWhyNeeded === "string" ? order.newDevWhyNeeded : "",
        }}
      />

      {!isAuditView && (
        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>Workflow timeline</CardTitle>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
                {auditLogsDesc.length} event{auditLogsDesc.length === 1 ? "" : "s"}
              </span>
            </div>
            <p className="text-sm text-slate-500 font-normal">Every step in this enquiry — newest first.</p>
          </CardHeader>
          <CardContent>
            {auditQueryError ? (
              <p className="text-sm text-red-600">Could not load activity log.</p>
            ) : auditLoading && auditLogsDesc.length === 0 ? (
              <p className="text-sm text-slate-500">Loading timeline…</p>
            ) : auditLogsDesc.length === 0 ? (
              <p className="text-sm text-slate-500">No logged events yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                {auditLogsDesc.map((log) => {
                  const who = log.user?.name?.trim() ? log.user.name : "System";
                  const role = log.user?.role?.trim() ? log.user.role : "";
                  const extra = auditPayloadSummary(log.action, log.payload, { hideSlaTimingCopy });

                  const kind =
                    log.action === "OrderRejected" || log.action === "OrderCancelled"
                      ? "danger"
                      : log.action === "OrderTransferred"
                        ? "transfer"
                        : log.action === "OrderAccepted" ||
                            log.action === "OrderCompleted" ||
                            log.action === "SupervisorHandoffSubmitted" ||
                            log.action === "ORDERENQUIRYHANDOFFSUBMITTED" ||
                            log.action === "SAMPLEHEADREQUESTAPPROVED"
                          ? "success"
                          : "neutral";

                  const Icon =
                    kind === "transfer" ? ArrowRightLeft : kind === "danger" ? X : kind === "success" ? Check : CircleDot;
                  const iconWrap =
                    kind === "transfer"
                      ? "bg-slate-100 text-slate-700"
                      : kind === "danger"
                        ? "bg-rose-100 text-rose-700"
                        : kind === "success"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-100 text-slate-600";

                  return (
                    <li key={log.id} className="flex items-start gap-3 px-4 py-3">
                      <span className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${iconWrap}`}>
                        <Icon className="h-4 w-4" />
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">
                              {auditActionLabel(log.action, { hideSlaTimingCopy })}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              by <span className="font-medium text-slate-700">{who}</span>
                              {role ? (
                                <>
                                  {" · "}
                                  <span className="font-medium text-slate-600">{role}</span>
                                </>
                              ) : null}
                            </p>
                          </div>
                          <time className="shrink-0 text-xs text-slate-400 tabular-nums">
                            {new Date(log.createdAt).toLocaleString()}
                          </time>
                        </div>
                        {extra ? <p className="mt-2 text-xs text-slate-600">{extra}</p> : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
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

      {/* Sample new-development dialogs removed. */}

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
