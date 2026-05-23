import * as XLSX from "xlsx";
import type { EnquiryPeriodFilter } from "@/lib/date-period";
import { formatEnquiryNumber } from "@/lib/enquiry-display";

type OrderRow = {
  orderNumber: string;
  status: string;
  priority?: string | null;
  companyName?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  customerAddress?: string | null;
  gstNumber?: string | null;
  description?: string | null;
  customFields?: unknown;
  customerOrderDate?: string | null;
  sampleRequested?: boolean;
  sampleRequestNotes?: string | null;
  sampleDetails?: string | null;
  sampleQuantity?: string | null;
  sampleWeight?: string | null;
  sampleShippedByCourier?: boolean;
  courierName?: string | null;
  trackingId?: string | null;
  sampleApprovedAt?: string | null;
  sampleShippedAt?: string | null;
  sampleReceivedAt?: string | null;
  sampleDeliveryDate?: string | null;
  sampleRemarks?: string | null;
  salesFeedback?: string | null;
  salesFeedbackAt?: string | null;
  customerFeedback?: string | null;
  customerFeedbackAt?: string | null;
  customerResponseStatus?: string | null;
  customerFeedbackRemarks?: string | null;
  acceptanceReason?: string | null;
  cancellationReason?: string | null;
  transferCount?: number;
  rejectionCount?: number;
  createdAt: string;
  updatedAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  createdBy?: { name?: string; email?: string } | null;
  currentDivision?: { name?: string } | null;
  completedBy?: { name?: string } | null;
  cancelledBy?: { name?: string } | null;
  assignedSupervisor?: { name?: string } | null;
};

export type EnquiryExportQuery = {
  period?: EnquiryPeriodFilter;
  /** HTML date input values `YYYY-MM-DD`; both required to apply custom range. */
  from?: string;
  to?: string;
  /** Optional division filter for exports (accounts view). */
  divisionId?: string;
};

function exportQueryString(q: EnquiryExportQuery): string {
  const div = q.divisionId?.trim() ? `&divisionId=${encodeURIComponent(q.divisionId.trim())}` : "";
  if (q.from?.trim() && q.to?.trim()) {
    return `${div}&from=${encodeURIComponent(q.from.trim())}&to=${encodeURIComponent(q.to.trim())}`;
  }
  if (q.period) {
    return `${div}&period=${encodeURIComponent(q.period)}`;
  }
  return div;
}

function fmtDate(val?: string | null): string {
  if (!val) return "";
  return new Date(val).toLocaleString();
}

function fmtBool(val?: boolean | null): string {
  if (val === true) return "Yes";
  if (val === false) return "No";
  return "";
}

function fmtCustomFields(val?: unknown): string {
  if (!val || typeof val !== "object") return "";
  return Object.entries(val as Record<string, unknown>)
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join(" | ");
}

export async function fetchAllOrdersForExport(q: EnquiryExportQuery): Promise<OrderRow[]> {
  const all: OrderRow[] = [];
  let page = 1;
  const limit = 200;
  const qs = exportQueryString(q);
  while (true) {
    const res = await fetch(`/api/orders?page=${page}&limit=${limit}&export=1${qs}`, { credentials: "include" });
    if (!res.ok) throw new Error("Could not load enquiries for export");
    const data = (await res.json()) as { orders: OrderRow[]; total: number };
    all.push(...data.orders);
    if (all.length >= data.total || data.orders.length === 0) break;
    page += 1;
  }
  return all;
}

export function downloadEnquiriesExcel(rows: OrderRow[], periodLabel: string, hideDivision: boolean): void {
  const flat = rows.map((o) => {
    const row: Record<string, string | number> = {
      "Enquiry number": formatEnquiryNumber(o.orderNumber),
      Status: o.status,
      Priority: o.priority ?? "",
      "Company name": o.companyName ?? "",
      "Customer name": o.customerName ?? "",
      "Customer phone": o.customerPhone ?? "",
      "Customer email": o.customerEmail ?? "",
      "Customer address": o.customerAddress ?? "",
      "GST number": o.gstNumber ?? "",
      "Product description": o.description ?? "",
      "Custom fields": fmtCustomFields(o.customFields),
      "Customer order date": o.customerOrderDate ? fmtDate(o.customerOrderDate) : "",
      "Sample requested": fmtBool(o.sampleRequested),
      "Sample request notes": o.sampleRequestNotes ?? "",
      "Sample details": o.sampleDetails ?? "",
      "Sample quantity": o.sampleQuantity ?? "",
      "Sample weight": o.sampleWeight ?? "",
      "Shipped by courier": o.sampleRequested ? fmtBool(o.sampleShippedByCourier) : "",
      "Courier name": o.courierName ?? "",
      "Tracking ID": o.trackingId ?? "",
      "Sample approved at": fmtDate(o.sampleApprovedAt),
      "Sample shipped at": fmtDate(o.sampleShippedAt),
      "Sample received at": fmtDate(o.sampleReceivedAt),
      "Sample delivery date": fmtDate(o.sampleDeliveryDate),
      "Sample remarks": o.sampleRemarks ?? "",
      "Sales feedback": o.salesFeedback ?? "",
      "Sales feedback at": fmtDate(o.salesFeedbackAt),
      "Customer feedback": o.customerFeedback ?? "",
      "Customer feedback at": fmtDate(o.customerFeedbackAt),
      "Customer response status": o.customerResponseStatus ?? "",
      "Customer feedback remarks": o.customerFeedbackRemarks ?? "",
      "Acceptance reason": o.acceptanceReason ?? "",
      "Cancellation reason": o.cancellationReason ?? "",
      "Transfer count": o.transferCount ?? 0,
      "Rejection count": o.rejectionCount ?? 0,
      "Raised by": o.createdBy?.name ?? "",
      "Raised by email": o.createdBy?.email ?? "",
      "Assigned supervisor": o.assignedSupervisor?.name ?? "",
      "Completed by": o.completedBy?.name ?? "",
      "Cancelled by": o.cancelledBy?.name ?? "",
      "Placed at": fmtDate(o.createdAt),
      "Last updated": fmtDate(o.updatedAt),
      "Completed at": fmtDate(o.completedAt),
      "Cancelled at": fmtDate(o.cancelledAt),
    };
    if (!hideDivision) {
      row.Division = o.currentDivision?.name ?? "";
    }
    return row;
  });
  const ws = XLSX.utils.json_to_sheet(flat);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Enquiries");
  const suffix = periodLabel || "all";
  XLSX.writeFile(wb, `enquiries-${suffix}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
