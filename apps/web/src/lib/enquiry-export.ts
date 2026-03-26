import * as XLSX from "xlsx";
import type { EnquiryPeriodFilter } from "@/lib/date-period";
import { formatEnquiryNumber } from "@/lib/enquiry-display";

type OrderRow = {
  orderNumber: string;
  status: string;
  createdAt: string;
  createdBy?: { name?: string; email?: string } | null;
  currentDivision?: { name?: string } | null;
};

export type EnquiryExportQuery = {
  period?: EnquiryPeriodFilter;
  /** HTML date input values `YYYY-MM-DD`; both required to apply custom range. */
  from?: string;
  to?: string;
};

function exportQueryString(q: EnquiryExportQuery): string {
  if (q.from?.trim() && q.to?.trim()) {
    return `&from=${encodeURIComponent(q.from.trim())}&to=${encodeURIComponent(q.to.trim())}`;
  }
  if (q.period) {
    return `&period=${encodeURIComponent(q.period)}`;
  }
  return "";
}

export async function fetchAllOrdersForExport(q: EnquiryExportQuery): Promise<OrderRow[]> {
  const all: OrderRow[] = [];
  let page = 1;
  const limit = 200;
  const qs = exportQueryString(q);
  while (true) {
    const res = await fetch(`/api/orders?page=${page}&limit=${limit}${qs}`, { credentials: "include" });
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
    const base: Record<string, string> = {
      "Enquiry number": formatEnquiryNumber(o.orderNumber),
      Status: o.status,
      "Raised by": o.createdBy?.name ?? "",
      Email: o.createdBy?.email ?? "",
      "Placed at": new Date(o.createdAt).toLocaleString(),
    };
    if (!hideDivision) {
      base.Division = o.currentDivision?.name ?? "";
    }
    return base;
  });
  const ws = XLSX.utils.json_to_sheet(flat);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Enquiries");
  const suffix = periodLabel || "all";
  XLSX.writeFile(wb, `enquiries-${suffix}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
