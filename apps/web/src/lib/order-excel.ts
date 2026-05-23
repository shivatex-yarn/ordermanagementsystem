import * as XLSX from "xlsx";
import { formatEnquiryNumber } from "@/lib/enquiry-display";

const INTERNAL_CF_KEYS = new Set([
  "supervisorHandoff", "sampleDevelopment", "sampleStatusUpdates",
  "enquiryHandoff", "newDevelopment",
]);

type TransferRow = {
  createdAt: string;
  reason?: string | null;
  transferDetails?: string | null;
  fromDivision?: { name?: string | null } | null;
  toDivision?: { name?: string | null } | null;
  transferredBy?: { name?: string | null; email?: string | null } | null;
};

type RejectionRow = {
  createdAt: string;
  reason?: string | null;
  division?: { name?: string | null } | null;
  rejectedBy?: { name?: string | null; email?: string | null } | null;
};

type EditHistoryRow = {
  id: number;
  fieldName: string;
  oldValue?: string | null;
  newValue?: string | null;
  user: { name: string };
  createdAt: string;
};

export type OrderExcelDetail = {
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
  transfers?: TransferRow[];
  rejections?: RejectionRow[];
  editHistory?: EditHistoryRow[];
};

function d(val?: string | null): string {
  if (!val) return "";
  return new Date(val).toLocaleString(undefined, {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function dateOnly(val?: string | null): string {
  if (!val) return "";
  const dt = new Date(val);
  if (Number.isNaN(dt.getTime())) return val;
  return dt.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function s(val?: string | null | boolean | number): string {
  if (val == null) return "";
  if (typeof val === "boolean") return val ? "Yes" : "No";
  return String(val).trim();
}

function nameEmail(person?: { name?: string | null; email?: string | null } | null): string {
  if (!person) return "";
  return [person.name, person.email].filter(Boolean).join("  |  ");
}

function getNewDevPlan(order: OrderExcelDetail): Record<string, unknown> | null {
  if (order.newDevPlan && typeof order.newDevPlan === "object") return order.newDevPlan;
  const h = order.enquiryHandoff;
  if (h && h.developmentKind === "new" && h.planning && typeof h.planning === "object") {
    return h.planning as Record<string, unknown>;
  }
  return null;
}

/** Build an aoa (array-of-arrays) row: [label, value] with a blank A col for indent. */
function row(label: string, value: string): [string, string, string] {
  return ["", label, value];
}

/** Section header row — spans all 3 columns via merges set later. */
function sectionHeader(title: string, role?: string): [string, string, string] {
  return [title.toUpperCase(), role ? `  ←  ${role}` : "", ""];
}

function blank(): ["", "", ""] { return ["", "", ""]; }

export function downloadOrderExcel(order: OrderExcelDetail): void {
  const enqNum = order.orderNumber ? formatEnquiryNumber(order.orderNumber) : "unknown";
  const h = order.enquiryHandoff;
  const devKind = typeof h?.developmentKind === "string" ? h.developmentKind : null;
  const existingDetails = typeof h?.existingProductDetails === "string" ? h.existingProductDetails : null;
  const newDevPlan = getNewDevPlan(order);
  const cfEntries = Object.entries(order.customFields ?? {}).filter(([k]) => !INTERNAL_CF_KEYS.has(k));

  /* ── SHEET 1: Full Details ─────────────────────────────────── */
  const aoa: [string, string, string][] = [];
  const merges: XLSX.Range[] = [];

  function addSection(title: string, role?: string) {
    aoa.push(blank());
    const r = aoa.length; // 1-based after push
    aoa.push(sectionHeader(title, role));
    // merge col A–C for this header row
    merges.push({ s: { r: r, c: 0 }, e: { r: r, c: 2 } });
    aoa.push(["", "Field", "Value"]);
  }

  function addRow(label: string, value: string) {
    if (value) aoa.push(row(label, value));
  }

  // ── Title block
  aoa.push(["ENQUIRY REPORT", enqNum, `Generated: ${new Date().toLocaleString()}`]);
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 0 } });

  // ── 1. Enquiry Overview
  addSection("Enquiry Overview");
  addRow("Enquiry Number", enqNum);
  addRow("Status", s(order.status).replace(/_/g, " "));
  addRow("Priority", s(order.priority));
  addRow("Current Division", s(order.currentDivision?.name));
  addRow("Placed On", d(order.createdAt));
  addRow("Last Updated", d(order.updatedAt));
  if (order.slaDeadline) addRow("SLA Deadline", d(order.slaDeadline));
  if (order.completedAt) addRow("Completed At", d(order.completedAt));
  if (order.completedBy?.name) addRow("Completed By", nameEmail(order.completedBy));
  if (order.cancelledAt) addRow("Cancelled At", d(order.cancelledAt));
  if (order.cancelledBy?.name) addRow("Cancelled By", s(order.cancelledBy.name));
  if (order.cancellationReason) addRow("Cancellation Reason", s(order.cancellationReason));
  if ((order.transferCount ?? 0) > 0) addRow("Total Transfers", s(order.transferCount));
  if ((order.rejectionCount ?? 0) > 0) addRow("Total Rejections", s(order.rejectionCount));

  // ── 2. Customer Details (User)
  addSection("Customer Details", "Submitted by Salesperson / User");
  addRow("Company Name", s(order.companyName));
  addRow("Customer Name", s(order.customerName));
  addRow("Phone Number", s(order.customerPhone));
  addRow("Email Address", s(order.customerEmail));
  addRow("Address", s(order.customerAddress));
  addRow("GST Number", s(order.gstNumber));
  addRow("Customer Order Date", dateOnly(order.customerOrderDate));
  addRow("Submitted By", nameEmail(order.createdBy));

  // ── 3. Product / Enquiry Details (User)
  addSection("Product / Enquiry Details", "Submitted by Salesperson / User");
  addRow("Product Description", s(order.description));
  addRow("Sample Requested", s(order.sampleRequested));
  if (order.sampleRequested && order.sampleRequestNotes) {
    addRow("Sample Request Notes", s(order.sampleRequestNotes));
  }
  for (const [k, v] of cfEntries) {
    addRow(k, typeof v === "string" ? v : JSON.stringify(v));
  }

  // ── 4. Division Handling (Manager / Division Head)
  const hasManagerData = order.acceptedBy || order.acceptanceReason || order.receiveReason ||
    h || newDevPlan || order.assignedSupervisor || order.headSampleRequestApprovedAt;

  if (hasManagerData) {
    addSection("Division Handling", "Added by Manager / Division Head");
    if (order.acceptedBy?.name) addRow("Accepted By", nameEmail(order.acceptedBy));
    if (order.acceptanceReason) addRow("Acceptance Notes", s(order.acceptanceReason));
    if (order.receivedBy?.name) addRow("Received By", nameEmail(order.receivedBy));
    if (order.receiveReason) addRow("Receive Notes", s(order.receiveReason));
    if (order.assignedSupervisor?.name) addRow("Assigned Supervisor", nameEmail(order.assignedSupervisor));
    if (devKind) addRow("Development Type", devKind === "existing" ? "Existing Product" : "New Development");
    if (devKind === "existing" && existingDetails) addRow("Existing Product Details", s(existingDetails));
    if (devKind === "new" && newDevPlan) {
      if (newDevPlan.description) addRow("Development Overview", String(newDevPlan.description));
      if (newDevPlan.reasonForNewDevelopment) addRow("Reason for New Development", String(newDevPlan.reasonForNewDevelopment));
      if (newDevPlan.resourcesRequired) addRow("Resources Required", String(newDevPlan.resourcesRequired));
      if (newDevPlan.researchRequirements) addRow("Research Requirements", String(newDevPlan.researchRequirements));
      if (newDevPlan.planningNotes) addRow("Planning Notes", String(newDevPlan.planningNotes));
      if (newDevPlan.estimatedTimeline) addRow("Estimated Timeline", dateOnly(String(newDevPlan.estimatedTimeline)));
      if (newDevPlan.expectedCompletionDuration) addRow("Expected Completion Date", dateOnly(String(newDevPlan.expectedCompletionDuration)));
      if (newDevPlan.internalNotes) addRow("Internal Notes", String(newDevPlan.internalNotes));
    }
    if (order.headSampleRequestApprovedAt) addRow("Sample Request Approved At", d(order.headSampleRequestApprovedAt));
    if (order.headSampleRequestApprovedBy?.name) addRow("Sample Request Approved By", s(order.headSampleRequestApprovedBy.name));
  }

  // ── 5. Sample Details (Supervisor)
  if (order.sampleRequested) {
    addSection("Sample Details", "Added by Supervisor");
    if (order.sampleApprovedAt) addRow("Sample Approved At", d(order.sampleApprovedAt));
    if (order.sampleApprovedBy?.name) addRow("Sample Approved By", s(order.sampleApprovedBy.name));
    addRow("Sample Specifications", s(order.sampleDetails));
    addRow("Quantity", s(order.sampleQuantity));
    addRow("Weight", s(order.sampleWeight));
    addRow("Expected Delivery Date", dateOnly(order.sampleDeliveryDate));
    addRow("Remarks", s(order.sampleRemarks));
    addRow("Shipped By Courier", s(order.sampleShippedByCourier));
    if (order.sampleShippedByCourier) {
      addRow("Courier Name", s(order.courierName));
      addRow("Tracking ID", s(order.trackingId));
    }
    if (order.sampleShippedAt) addRow("Sample Shipped At", d(order.sampleShippedAt));
    if (order.sampleReceivedAt) addRow("Sample Received At", d(order.sampleReceivedAt));
    if (order.sampleSpecsAcknowledgedAt) addRow("Specs Acknowledged At", d(order.sampleSpecsAcknowledgedAt));
    if (order.sampleSpecsAcknowledgedBy?.name) addRow("Specs Acknowledged By", s(order.sampleSpecsAcknowledgedBy.name));
  }

  // ── 6. Feedback
  const hasFeedback = order.salesFeedback || order.customerFeedback || order.customerResponseStatus;
  if (hasFeedback) {
    addSection("Feedback");
    if (order.salesFeedback) addRow("Sales Feedback", s(order.salesFeedback));
    if (order.salesFeedbackAt) addRow("Sales Feedback Date", d(order.salesFeedbackAt));
    if (order.customerResponseStatus) addRow("Customer Response Status", s(order.customerResponseStatus));
    if (order.customerFeedback) addRow("Customer Feedback", s(order.customerFeedback));
    if (order.customerFeedbackAt) addRow("Customer Feedback Date", d(order.customerFeedbackAt));
    if (order.customerFeedbackRemarks) addRow("Customer Feedback Remarks", s(order.customerFeedbackRemarks));
  }

  const ws1 = XLSX.utils.aoa_to_sheet(aoa);
  ws1["!merges"] = merges;
  ws1["!cols"] = [{ wch: 2 }, { wch: 32 }, { wch: 62 }];

  /* ── SHEET 2: Transfer & Rejection History ─────────────────── */
  const histAoa: (string | number)[][] = [];

  if ((order.transfers?.length ?? 0) > 0) {
    histAoa.push(["TRANSFER HISTORY"]);
    histAoa.push(["#", "Date", "From Division", "To Division", "Transferred By", "Reason", "Details"]);
    order.transfers!.forEach((t, i) => {
      histAoa.push([
        i + 1,
        d(t.createdAt),
        s(t.fromDivision?.name),
        s(t.toDivision?.name),
        nameEmail(t.transferredBy),
        s(t.reason),
        s(t.transferDetails),
      ]);
    });
    histAoa.push([]);
  }

  if ((order.rejections?.length ?? 0) > 0) {
    histAoa.push(["REJECTION HISTORY"]);
    histAoa.push(["#", "Date", "Division", "Rejected By", "Reason"]);
    order.rejections!.forEach((r, i) => {
      histAoa.push([
        i + 1,
        d(r.createdAt),
        s(r.division?.name),
        nameEmail(r.rejectedBy),
        s(r.reason),
      ]);
    });
    histAoa.push([]);
  }

  if ((order.editHistory?.length ?? 0) > 0) {
    histAoa.push(["EDIT HISTORY"]);
    histAoa.push(["#", "Date", "Field Changed", "Old Value", "New Value", "Changed By"]);
    order.editHistory!.forEach((e, i) => {
      histAoa.push([
        i + 1,
        d(e.createdAt),
        s(e.fieldName),
        s(e.oldValue),
        s(e.newValue),
        s(e.user.name),
      ]);
    });
  }

  const ws2 = XLSX.utils.aoa_to_sheet(histAoa.length > 0 ? histAoa : [["No history records"]]);
  ws2["!cols"] = [{ wch: 4 }, { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 30 }, { wch: 35 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws1, "Enquiry Details");
  XLSX.utils.book_append_sheet(wb, ws2, "History");

  const date = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `enquiry-${enqNum}-${date}.xlsx`);
}
