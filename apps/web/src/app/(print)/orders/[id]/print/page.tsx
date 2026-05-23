"use client";

import { use, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatEnquiryNumber } from "@/lib/enquiry-display";

type OrderDetail = {
  id: number;
  orderNumber: string | null;
  status: string;
  priority?: string | null;
  createdAt: string;
  updatedAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  slaDeadline?: string | null;
  companyName?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  customerAddress?: string | null;
  gstNumber?: string | null;
  customerOrderDate?: string | null;
  description?: string | null;
  customFields?: Record<string, unknown> | null;
  sampleRequested?: boolean;
  sampleRequestNotes?: string | null;
  sampleDetails?: string | null;
  sampleQuantity?: string | null;
  sampleWeight?: string | null;
  sampleShippedByCourier?: boolean;
  courierName?: string | null;
  trackingId?: string | null;
  sampleApprovedAt?: string | null;
  sampleApprovedBy?: { name?: string | null } | null;
  headSampleRequestApprovedAt?: string | null;
  headSampleRequestApprovedBy?: { name?: string | null } | null;
  sampleShippedAt?: string | null;
  sampleReceivedAt?: string | null;
  sampleDeliveryDate?: string | null;
  sampleRemarks?: string | null;
  sampleSpecsAcknowledgedAt?: string | null;
  sampleSpecsAcknowledgedBy?: { name?: string | null } | null;
  salesFeedback?: string | null;
  salesFeedbackAt?: string | null;
  customerFeedback?: string | null;
  customerFeedbackAt?: string | null;
  customerResponseStatus?: string | null;
  customerFeedbackRemarks?: string | null;
  acceptanceReason?: string | null;
  receiveReason?: string | null;
  cancellationReason?: string | null;
  transferCount?: number;
  rejectionCount?: number;
  enquiryHandoff?: Record<string, unknown> | null;
  newDevPlan?: Record<string, unknown> | null;
  currentDivision?: { name?: string | null } | null;
  createdBy?: { name?: string | null; email?: string | null } | null;
  acceptedBy?: { name?: string | null; email?: string | null } | null;
  receivedBy?: { name?: string | null; email?: string | null } | null;
  completedBy?: { name?: string | null; email?: string | null } | null;
  cancelledBy?: { name?: string | null } | null;
  assignedSupervisor?: { name?: string | null; email?: string | null } | null;
  transfers?: Array<{
    createdAt: string;
    reason?: string | null;
    transferDetails?: string | null;
    fromDivision?: { name?: string | null } | null;
    toDivision?: { name?: string | null } | null;
    transferredBy?: { name?: string | null; email?: string | null } | null;
  }>;
  rejections?: Array<{
    createdAt: string;
    reason?: string | null;
    division?: { name?: string | null } | null;
    rejectedBy?: { name?: string | null; email?: string | null } | null;
  }>;
  editHistory?: Array<{
    id: number;
    fieldName: string;
    oldValue?: string | null;
    newValue?: string | null;
    user: { name: string };
    createdAt: string;
  }>;
};

const INTERNAL_CF = new Set([
  "supervisorHandoff","sampleDevelopment","sampleStatusUpdates","enquiryHandoff","newDevelopment",
]);

const STATUS_COLOR: Record<string, string> = {
  PLACED: "#64748b",
  IN_PROGRESS: "#2563eb",
  TRANSFERRED: "#d97706",
  REJECTED: "#dc2626",
  COMPLETED: "#16a34a",
  CANCELLED: "#78716c",
};

const STATUS_BG: Record<string, string> = {
  PLACED: "#f1f5f9",
  IN_PROGRESS: "#eff6ff",
  TRANSFERRED: "#fffbeb",
  REJECTED: "#fef2f2",
  COMPLETED: "#f0fdf4",
  CANCELLED: "#f5f5f4",
};

function fmtDate(v?: string | null) {
  if (!v) return "—";
  return new Date(v).toLocaleString(undefined, { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" });
}
function fmtDay(v?: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  return isNaN(d.getTime()) ? v : d.toLocaleDateString(undefined, { day:"2-digit", month:"short", year:"numeric" });
}
function sv(v?: string | null | boolean) {
  if (v == null) return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return v.trim() || "—";
}
function nameMail(p?: { name?: string|null; email?: string|null }|null) {
  if (!p) return "—";
  return [p.name, p.email].filter(Boolean).join(" · ") || "—";
}
function getDevPlan(o: OrderDetail): Record<string,unknown>|null {
  if (o.newDevPlan && typeof o.newDevPlan === "object") return o.newDevPlan;
  const h = o.enquiryHandoff;
  if (h?.developmentKind === "new" && typeof h.planning === "object" && h.planning) return h.planning as Record<string,unknown>;
  return null;
}

/* ── Primitives ───────────────────────────────────── */

const sectionAccents: Record<string, { bar: string; bg: string; label: string }> = {
  overview:  { bar: "#1e3a5f", bg: "#f8fafc", label: "#1e3a5f" },
  customer:  { bar: "#0ea5e9", bg: "#f0f9ff", label: "#0369a1" },
  product:   { bar: "#8b5cf6", bg: "#faf5ff", label: "#6d28d9" },
  manager:   { bar: "#f59e0b", bg: "#fffbeb", label: "#b45309" },
  supervisor:{ bar: "#10b981", bg: "#f0fdf4", label: "#065f46" },
  feedback:  { bar: "#f43f5e", bg: "#fff1f2", label: "#be123c" },
  history:   { bar: "#64748b", bg: "#f8fafc", label: "#334155" },
};

function SectionCard({
  id, title, badge, children,
}: { id: keyof typeof sectionAccents; title: string; badge?: string; children: React.ReactNode }) {
  const a = sectionAccents[id];
  return (
    <div style={{
      marginBottom: 20,
      borderRadius: 10,
      overflow: "hidden",
      border: "1px solid #e2e8f0",
      boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
      breakInside: "avoid",
    }}>
      {/* Coloured bar */}
      <div style={{ height: 4, background: a.bar }} />
      {/* Section header */}
      <div style={{
        background: a.bg,
        borderBottom: "1px solid #e2e8f0",
        padding: "8px 14px",
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: a.label }}>
          {title}
        </span>
        {badge && (
          <span style={{
            marginLeft: "auto",
            fontSize: 10,
            fontWeight: 500,
            color: a.label,
            background: "rgba(0,0,0,0.05)",
            borderRadius: 20,
            padding: "2px 10px",
            letterSpacing: "0.02em",
          }}>
            {badge}
          </span>
        )}
      </div>
      {/* Rows */}
      <div style={{ background: "#fff" }}>
        {children}
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  if (!value || value === "—") return null;
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "200px 1fr",
      gap: "0 12px",
      padding: "5px 14px",
      borderBottom: "1px solid #f1f5f9",
      alignItems: "baseline",
    }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b", letterSpacing: "0.01em" }}>
        {label}
      </span>
      <span style={{
        fontSize: 11.5,
        color: "#1e293b",
        fontFamily: mono ? "'Courier New', monospace" : "inherit",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        lineHeight: 1.5,
      }}>
        {value}
      </span>
    </div>
  );
}

function HistoryCard({
  id, title, children,
}: { id: keyof typeof sectionAccents; title: string; children: React.ReactNode }) {
  const a = sectionAccents[id];
  return (
    <div style={{
      marginBottom: 18,
      borderRadius: 10,
      overflow: "hidden",
      border: "1px solid #e2e8f0",
      breakInside: "avoid",
    }}>
      <div style={{ height: 4, background: a.bar }} />
      <div style={{ background: a.bg, borderBottom: "1px solid #e2e8f0", padding: "7px 14px" }}>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: a.label }}>
          {title}
        </span>
      </div>
      <div style={{ background: "#fff", padding: "4px 0" }}>
        {children}
      </div>
    </div>
  );
}

function HistoryItem({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: "8px 14px", borderBottom: "1px solid #f8fafc", fontSize: 11.5 }}>
      {children}
    </div>
  );
}

async function fetchOrder(id: number): Promise<OrderDetail> {
  const res = await fetch(`/api/orders/${id}`, { credentials: "include" });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json() as Promise<OrderDetail>;
}

export default function OrderPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const orderId = Number(id);

  const { data: order, isLoading, isError } = useQuery({
    queryKey: ["order-print", orderId],
    queryFn: () => fetchOrder(orderId),
    staleTime: 0,
  });

  useEffect(() => {
    if (!order) return;
    const t = setTimeout(() => window.print(), 900);
    return () => clearTimeout(t);
  }, [order]);

  if (isLoading) return (
    <div style={{ fontFamily: "sans-serif", display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", color: "#64748b", fontSize: 14 }}>
      Loading enquiry…
    </div>
  );

  if (isError || !order) return (
    <div style={{ fontFamily: "sans-serif", display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", color: "#ef4444", fontSize: 14 }}>
      Could not load enquiry — please close this tab and try again.
    </div>
  );

  const statusColor = STATUS_COLOR[order.status] ?? "#64748b";
  const statusBg   = STATUS_BG[order.status]    ?? "#f8fafc";
  const enqNum = order.orderNumber ? formatEnquiryNumber(order.orderNumber) : "—";
  const h = order.enquiryHandoff;
  const devKind = typeof h?.developmentKind === "string" ? h.developmentKind : null;
  const existingDetails = typeof h?.existingProductDetails === "string" ? h.existingProductDetails : null;
  const newDevPlan = getDevPlan(order);
  const cfEntries = Object.entries(order.customFields ?? {}).filter(([k]) => !INTERNAL_CF.has(k));

  const hasManagerSection = !!(
    order.acceptedBy || order.acceptanceReason || order.receiveReason ||
    h || newDevPlan || order.assignedSupervisor || order.headSampleRequestApprovedAt
  );
  const hasFeedback = !!(order.salesFeedback || order.customerFeedback || order.customerResponseStatus);
  const hasTransfers = (order.transfers?.length ?? 0) > 0;
  const hasRejections = (order.rejections?.length ?? 0) > 0;
  const hasEdits = (order.editHistory?.length ?? 0) > 0;

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Segoe UI', system-ui, Arial, sans-serif; background: #f1f5f9; color: #1e293b; }
        @media print {
          body { background: #fff; }
          .no-print { display: none !important; }
          @page { margin: 1cm 1.3cm; size: A4 portrait; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}</style>

      {/* ── Toolbar (hidden when printing) ── */}
      <div className="no-print" style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 200,
        background: "#1e3a5f",
        padding: "10px 24px",
        display: "flex", alignItems: "center", gap: 12,
        boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
      }}>
        <img src="/company-logo.png" alt="Logo" style={{ height: 32, width: 32, borderRadius: 6, background: "#fff", padding: 3 }} />
        <span style={{ color: "#fff", fontSize: 14, fontWeight: 600, flex: 1 }}>
          Enquiry Report — {enqNum}
        </span>
        <button
          onClick={() => window.print()}
          style={{
            background: "#fff", color: "#1e3a5f", border: "none",
            borderRadius: 8, padding: "7px 20px", cursor: "pointer",
            fontSize: 13, fontWeight: 700,
          }}
        >
          ⬇ Save as PDF
        </button>
        <button
          onClick={() => window.close()}
          style={{
            background: "rgba(255,255,255,0.15)", color: "#fff",
            border: "1px solid rgba(255,255,255,0.3)",
            borderRadius: 8, padding: "7px 16px", cursor: "pointer", fontSize: 13,
          }}
        >
          ✕ Close
        </button>
      </div>

      {/* ── Page ── */}
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "72px 16px 40px" }}>

        {/* ── Document Header ── */}
        <div style={{
          background: "#1e3a5f",
          borderRadius: 14,
          padding: "24px 28px",
          marginBottom: 24,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 20,
        }}>
          {/* Left: logo + title */}
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <img
              src="/company-logo.png"
              alt="Company Logo"
              style={{ height: 64, width: 64, background: "#fff", borderRadius: 10, padding: 6 }}
            />
            <div>
              <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>
                Enquiry Report
              </div>
              <div style={{ color: "#fff", fontSize: 20, fontWeight: 800, fontFamily: "monospace", letterSpacing: "-0.5px" }}>
                {enqNum}
              </div>
              <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, marginTop: 4 }}>
                {order.currentDivision?.name ?? ""}
              </div>
            </div>
          </div>
          {/* Right: status pill + dates */}
          <div style={{ textAlign: "right" }}>
            <div style={{
              display: "inline-block",
              background: statusBg,
              color: statusColor,
              borderRadius: 20,
              padding: "5px 16px",
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginBottom: 10,
            }}>
              {order.status.replace(/_/g, " ")}
            </div>
            <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 10.5, lineHeight: 1.7 }}>
              <div>Placed: {fmtDate(order.createdAt)}</div>
              {order.slaDeadline && <div>SLA: {fmtDate(order.slaDeadline)}</div>}
              {order.completedAt && <div>Completed: {fmtDate(order.completedAt)}</div>}
              {order.cancelledAt && <div>Cancelled: {fmtDate(order.cancelledAt)}</div>}
            </div>
            <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 9.5, marginTop: 8 }}>
              Generated {new Date().toLocaleString()}
            </div>
          </div>
        </div>

        {/* ── Quick-stat row ── */}
        {[
          { label: "Priority", value: sv(order.priority) },
          { label: "Transfers", value: String(order.transferCount ?? 0) },
          { label: "Rejections", value: String(order.rejectionCount ?? 0) },
          { label: "Division", value: sv(order.currentDivision?.name) },
        ].map(({ label, value }) => (
          <span key={label} style={{
            display: "inline-block",
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: 8,
            padding: "5px 14px",
            fontSize: 11,
            fontWeight: 600,
            color: "#475569",
            marginRight: 8,
            marginBottom: 18,
          }}>
            <span style={{ color: "#94a3b8", fontWeight: 500 }}>{label}: </span>{value}
          </span>
        ))}

        {/* ── 1: Enquiry Overview ── */}
        <SectionCard id="overview" title="Enquiry Overview">
          <Row label="Enquiry Number" value={enqNum} mono />
          <Row label="Status" value={order.status.replace(/_/g, " ")} />
          <Row label="Priority" value={sv(order.priority)} />
          <Row label="Current Division" value={sv(order.currentDivision?.name)} />
          <Row label="Placed On" value={fmtDate(order.createdAt)} />
          <Row label="Last Updated" value={fmtDate(order.updatedAt)} />
          {order.slaDeadline && <Row label="SLA Deadline" value={fmtDate(order.slaDeadline)} />}
          {order.completedAt && <Row label="Completed At" value={fmtDate(order.completedAt)} />}
          {order.completedBy?.name && <Row label="Completed By" value={nameMail(order.completedBy)} />}
          {order.cancelledAt && <Row label="Cancelled At" value={fmtDate(order.cancelledAt)} />}
          {order.cancelledBy?.name && <Row label="Cancelled By" value={sv(order.cancelledBy.name)} />}
          {order.cancellationReason && <Row label="Cancellation Reason" value={sv(order.cancellationReason)} />}
        </SectionCard>

        {/* ── 2: Customer Details (User) ── */}
        <SectionCard id="customer" title="Customer Details" badge="Submitted by Salesperson">
          <Row label="Company Name" value={sv(order.companyName)} />
          <Row label="Customer Name" value={sv(order.customerName)} />
          <Row label="Phone Number" value={sv(order.customerPhone)} />
          <Row label="Email Address" value={sv(order.customerEmail)} />
          <Row label="Address" value={sv(order.customerAddress)} />
          <Row label="GST Number" value={sv(order.gstNumber)} mono />
          <Row label="Customer Order Date" value={fmtDay(order.customerOrderDate)} />
          <Row label="Submitted By" value={nameMail(order.createdBy)} />
        </SectionCard>

        {/* ── 3: Product Details (User) ── */}
        <SectionCard id="product" title="Product / Enquiry Details" badge="Submitted by Salesperson">
          <Row label="Product Description" value={sv(order.description)} />
          <Row label="Sample Requested" value={order.sampleRequested ? "Yes" : "No"} />
          {order.sampleRequested && order.sampleRequestNotes && (
            <Row label="Sample Request Notes" value={sv(order.sampleRequestNotes)} />
          )}
          {cfEntries.map(([k, v]) => (
            <Row key={k} label={k} value={typeof v === "string" ? v : JSON.stringify(v)} />
          ))}
        </SectionCard>

        {/* ── 4: Division Handling (Manager) ── */}
        {hasManagerSection && (
          <SectionCard id="manager" title="Division Handling" badge="Added by Manager / Division Head">
            {order.acceptedBy?.name && <Row label="Accepted By" value={nameMail(order.acceptedBy)} />}
            {order.acceptanceReason && <Row label="Acceptance Notes" value={sv(order.acceptanceReason)} />}
            {order.receivedBy?.name && <Row label="Received By" value={nameMail(order.receivedBy)} />}
            {order.receiveReason && <Row label="Receive Notes" value={sv(order.receiveReason)} />}
            {order.assignedSupervisor?.name && <Row label="Assigned Supervisor" value={nameMail(order.assignedSupervisor)} />}
            {devKind && <Row label="Development Type" value={devKind === "existing" ? "Existing Product" : "New Development"} />}
            {devKind === "existing" && existingDetails && <Row label="Existing Product Details" value={sv(existingDetails)} />}
            {devKind === "new" && newDevPlan && (<>
              {newDevPlan.description && <Row label="Development Overview" value={String(newDevPlan.description)} />}
              {newDevPlan.reasonForNewDevelopment && <Row label="Reason for New Development" value={String(newDevPlan.reasonForNewDevelopment)} />}
              {newDevPlan.resourcesRequired && <Row label="Resources Required" value={String(newDevPlan.resourcesRequired)} />}
              {newDevPlan.researchRequirements && <Row label="Research Requirements" value={String(newDevPlan.researchRequirements)} />}
              {newDevPlan.planningNotes && <Row label="Planning Notes" value={String(newDevPlan.planningNotes)} />}
              {newDevPlan.estimatedTimeline && <Row label="Estimated Timeline" value={fmtDay(String(newDevPlan.estimatedTimeline))} />}
              {newDevPlan.expectedCompletionDuration && <Row label="Expected Completion Date" value={fmtDay(String(newDevPlan.expectedCompletionDuration))} />}
              {newDevPlan.internalNotes && <Row label="Internal Notes" value={String(newDevPlan.internalNotes)} />}
            </>)}
            {order.headSampleRequestApprovedAt && <Row label="Sample Request Approved At" value={fmtDate(order.headSampleRequestApprovedAt)} />}
            {order.headSampleRequestApprovedBy?.name && <Row label="Sample Request Approved By" value={sv(order.headSampleRequestApprovedBy.name)} />}
          </SectionCard>
        )}

        {/* ── 5: Sample Details (Supervisor) ── */}
        {order.sampleRequested && (
          <SectionCard id="supervisor" title="Sample Details" badge="Added by Supervisor">
            {order.sampleApprovedAt && <Row label="Sample Approved At" value={fmtDate(order.sampleApprovedAt)} />}
            {order.sampleApprovedBy?.name && <Row label="Sample Approved By" value={sv(order.sampleApprovedBy.name)} />}
            <Row label="Sample Specifications" value={sv(order.sampleDetails)} />
            <Row label="Quantity" value={sv(order.sampleQuantity)} />
            <Row label="Weight" value={sv(order.sampleWeight)} />
            <Row label="Expected Delivery Date" value={fmtDay(order.sampleDeliveryDate)} />
            <Row label="Remarks" value={sv(order.sampleRemarks)} />
            <Row label="Shipped By Courier" value={order.sampleShippedByCourier ? "Yes" : "No"} />
            {order.sampleShippedByCourier && <>
              <Row label="Courier Name" value={sv(order.courierName)} />
              <Row label="Tracking ID" value={sv(order.trackingId)} mono />
            </>}
            {order.sampleShippedAt && <Row label="Sample Shipped At" value={fmtDate(order.sampleShippedAt)} />}
            {order.sampleReceivedAt && <Row label="Sample Received At" value={fmtDate(order.sampleReceivedAt)} />}
            {order.sampleSpecsAcknowledgedAt && <Row label="Specs Acknowledged At" value={fmtDate(order.sampleSpecsAcknowledgedAt)} />}
            {order.sampleSpecsAcknowledgedBy?.name && <Row label="Specs Acknowledged By" value={sv(order.sampleSpecsAcknowledgedBy.name)} />}
          </SectionCard>
        )}

        {/* ── 6: Feedback ── */}
        {hasFeedback && (
          <SectionCard id="feedback" title="Feedback">
            {order.salesFeedback && <Row label="Sales Feedback" value={sv(order.salesFeedback)} />}
            {order.salesFeedbackAt && <Row label="Sales Feedback Date" value={fmtDate(order.salesFeedbackAt)} />}
            {order.customerResponseStatus && <Row label="Customer Response Status" value={sv(order.customerResponseStatus)} />}
            {order.customerFeedback && <Row label="Customer Feedback" value={sv(order.customerFeedback)} />}
            {order.customerFeedbackAt && <Row label="Customer Feedback Date" value={fmtDate(order.customerFeedbackAt)} />}
            {order.customerFeedbackRemarks && <Row label="Customer Feedback Remarks" value={sv(order.customerFeedbackRemarks)} />}
          </SectionCard>
        )}

        {/* ── 7: Transfer History ── */}
        {hasTransfers && (
          <HistoryCard id="history" title="Transfer History">
            {order.transfers!.map((t, i) => (
              <HistoryItem key={i}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ fontWeight: 700, color: "#1e293b" }}>
                    Transfer {i + 1}
                    {t.fromDivision?.name && t.toDivision?.name
                      ? ` — ${t.fromDivision.name} → ${t.toDivision.name}`
                      : ""}
                  </span>
                  <span style={{ color: "#94a3b8", fontSize: 10.5 }}>{fmtDate(t.createdAt)}</span>
                </div>
                {t.transferredBy?.name && <div style={{ color: "#475569" }}>By: {t.transferredBy.name}{t.transferredBy.email ? ` · ${t.transferredBy.email}` : ""}</div>}
                {t.reason && <div style={{ color: "#334155", marginTop: 2 }}>Reason: {t.reason}</div>}
                {t.transferDetails && <div style={{ color: "#334155" }}>Details: {t.transferDetails}</div>}
              </HistoryItem>
            ))}
          </HistoryCard>
        )}

        {/* ── 8: Rejection History ── */}
        {hasRejections && (
          <HistoryCard id="history" title="Rejection History">
            {order.rejections!.map((r, i) => (
              <HistoryItem key={i}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ fontWeight: 700, color: "#1e293b" }}>Rejection {i + 1}{r.division?.name ? ` — ${r.division.name}` : ""}</span>
                  <span style={{ color: "#94a3b8", fontSize: 10.5 }}>{fmtDate(r.createdAt)}</span>
                </div>
                {r.rejectedBy?.name && <div style={{ color: "#475569" }}>By: {r.rejectedBy.name}</div>}
                {r.reason && <div style={{ color: "#334155", marginTop: 2 }}>Reason: {r.reason}</div>}
              </HistoryItem>
            ))}
          </HistoryCard>
        )}

        {/* ── 9: Edit History ── */}
        {hasEdits && (
          <HistoryCard id="history" title="Edit History">
            {order.editHistory!.map((e) => (
              <HistoryItem key={e.id}>
                <span style={{ fontWeight: 600, color: "#334155" }}>{e.fieldName}</span>
                {" "}
                <span style={{ color: "#64748b" }}>
                  {e.oldValue != null ? <>changed from <em>&ldquo;{e.oldValue}&rdquo;</em> to </> : "set to "}
                  <strong style={{ color: "#1e293b" }}>&ldquo;{e.newValue}&rdquo;</strong>
                </span>
                {" "}by <strong>{e.user.name}</strong>
                <span style={{ color: "#94a3b8", float: "right", fontSize: 10.5 }}>{fmtDate(e.createdAt)}</span>
              </HistoryItem>
            ))}
          </HistoryCard>
        )}

        {/* ── Footer ── */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderTop: "1px solid #e2e8f0",
          paddingTop: 12,
          marginTop: 4,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <img src="/company-logo.png" alt="" style={{ height: 22, opacity: 0.5 }} />
            <span style={{ fontSize: 10, color: "#94a3b8" }}>Enquiry Management System</span>
          </div>
          <span style={{ fontSize: 10, color: "#94a3b8" }}>
            {enqNum} · {new Date().toLocaleString()} · Confidential
          </span>
        </div>
      </div>
    </>
  );
}
