/**
 * Client-side Excel and PDF export of enquiries. Libraries load on demand so the app bundle stays small.
 * Both files carry the company logo from /company-logo.png.
 */
import { COMPANY_NAME } from "@/lib/branding";

export type ExportRow = {
  orderNumber: string; status: string; enquiryDate: string; customerName: string; companyName: string | null;
  customerPhone: string | null; customerEmail: string | null; customerAddress: string | null; gstNumber: string | null;
  productDetails: string | null; isSample: boolean; sampleSentAt: string | null; sampleCourierName: string | null;
  sampleTrackingId: string | null; pricePerUnit: string | null; priceUnit: string | null; quantity: string | null;
  paymentTerms: string | null; deliveryTime: string | null; pricedAt: string | null; clientResponse: string | null;
  clientFeedback: string | null; clientFeedbackAt: string | null;
  division: { name: string }; createdBy: { name: string }; pricedBy: { name: string } | null;
};
export type ExportMeta = { generatedBy: string; filters: string[]; byDivision?: boolean };

const STATUS: Record<string, string> = { PLACED: "Needs pricing", PRICED: "Waiting for client", CLOSED: "Closed", CANCELLED: "Cancelled" };
const RESP: Record<string, string> = { ACCEPTED: "Accepted", NEGOTIATING: "Negotiating", DECLINED: "Declined" };
const INDIGO = "4F46E5";
const HEAD_FILL = "FF312E81"; // deep indigo for table headers

const d = (v: string | null) => (v ? new Date(v) : null);
const fmtD = (v: string | null) => (v ? new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "");
const stamp = () => new Date().toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const fileStamp = () => new Date().toLocaleDateString("en-CA"); // local date, YYYY-MM-DD

async function loadLogo(): Promise<{ buffer: ArrayBuffer; dataUrl: string } | null> {
  try {
    const res = await fetch("/company-logo.png");
    if (!res.ok) return null;
    const blob = await res.blob();
    const buffer = await blob.arrayBuffer();
    const dataUrl: string = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
    return { buffer, dataUrl };
  } catch {
    return null;
  }
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function counts(rows: ExportRow[]) {
  const c = { total: rows.length, PLACED: 0, PRICED: 0, CLOSED: 0, CANCELLED: 0 } as Record<string, number>;
  rows.forEach((r) => { c[r.status] = (c[r.status] ?? 0) + 1; });
  return c;
}

/* ───────────────────────────── helpers ───────────────────────────── */
function groupByDivision(rows: ExportRow[]) {
  const map = new Map<string, ExportRow[]>();
  rows.forEach((r) => { (map.get(r.division.name) ?? map.set(r.division.name, []).get(r.division.name)!).push(r); });
  return [...map.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
}
const safeSheet = (n: string, used: Set<string>) => {
  const base = n.replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 28) || "Division";
  let name = base, i = 2;
  while (used.has(name.toLowerCase())) name = `${base.slice(0, 26)} ${i++}`;
  used.add(name.toLowerCase());
  return name;
};

/* ───────────────────────────── Excel ───────────────────────────── */
const XL_COLS: { header: string; key: string; width: number; fmt?: string; align?: "left" | "center" | "right" }[] = [
  { header: "Enquiry no.", key: "no", width: 14 },
  { header: "Enquiry date", key: "date", width: 14, fmt: "dd mmm yyyy", align: "center" },
  { header: "Client", key: "client", width: 26 },
  { header: "Contact person", key: "contact", width: 20 },
  { header: "Phone", key: "phone", width: 15 },
  { header: "Email", key: "email", width: 26 },
  { header: "GST number", key: "gst", width: 18 },
  { header: "Division", key: "division", width: 14 },
  { header: "Product / requirement", key: "product", width: 36 },
  { header: "Sample?", key: "sample", width: 10, align: "center" },
  { header: "Sample sent", key: "sampleSent", width: 14, fmt: "dd mmm yyyy", align: "center" },
  { header: "Courier", key: "courier", width: 14 },
  { header: "Tracking ID", key: "tracking", width: 16 },
  { header: "Price (INR)", key: "price", width: 14, fmt: "#,##0.00", align: "right" },
  { header: "Per", key: "unit", width: 9, align: "center" },
  { header: "Quantity", key: "qty", width: 14 },
  { header: "Payment terms", key: "terms", width: 16 },
  { header: "Delivery time", key: "delivery", width: 16 },
  { header: "Priced by", key: "pricedBy", width: 16 },
  { header: "Client response", key: "resp", width: 16 },
  { header: "Client feedback", key: "feedback", width: 40 },
  { header: "Status", key: "status", width: 18, align: "center" },
  { header: "Logged by", key: "loggedBy", width: 16 },
];
type XlWorkbook = import("exceljs").Workbook;
type XlSheet = import("exceljs").Worksheet;

function banner(ws: XlSheet, wb: XlWorkbook, logoId: number | null, subtitle: string, meta: ExportMeta, lastCol: number) {
  ws.mergeCells(1, 1, 5, 1);
  if (logoId !== null) ws.addImage(logoId, { tl: { col: 0.1, row: 0.1 }, ext: { width: 96, height: 96 } });
  for (let r = 1; r <= 5; r++) ws.getRow(r).height = 20;
  ws.mergeCells(1, 2, 2, 8);
  const title = ws.getCell(1, 2);
  title.value = COMPANY_NAME;
  title.font = { name: "Calibri", size: 22, bold: true, color: { argb: "FF" + INDIGO } };
  title.alignment = { vertical: "middle" };
  ws.mergeCells(3, 2, 3, 8);
  ws.getCell(3, 2).value = subtitle;
  ws.getCell(3, 2).font = { name: "Calibri", size: 13, color: { argb: "FF475467" } };
  ws.mergeCells(4, 2, 4, 10);
  ws.getCell(4, 2).value = `Generated ${stamp()} by ${meta.generatedBy}`;
  ws.getCell(4, 2).font = { size: 10, color: { argb: "FF667085" } };
  ws.mergeCells(5, 2, 5, 10);
  ws.getCell(5, 2).value = meta.filters.length ? `Filters: ${meta.filters.join("  ·  ")}` : "Filters: none (all enquiries you can see)";
  ws.getCell(5, 2).font = { size: 10, italic: true, color: { argb: "FF667085" } };
  for (let c = 1; c <= lastCol; c++) ws.getCell(6, c).border = { top: { style: "medium", color: { argb: "FF" + INDIGO } } };
  ws.getRow(6).height = 6;
  void wb;
}

function summaryChips(ws: XlSheet, rows: ExportRow[]) {
  const k = counts(rows);
  [`Total ${k.total}`, `Needs pricing ${k.PLACED}`, `Waiting for client ${k.PRICED}`, `Closed ${k.CLOSED}`, `Cancelled ${k.CANCELLED}`].forEach((t, i) => {
    ws.mergeCells(7, 1 + i * 2, 7, 2 + i * 2);
    const cell = ws.getCell(7, 1 + i * 2);
    cell.value = t;
    cell.font = { bold: true, size: 11, color: { argb: "FF3730A3" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF0FF" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
  ws.getRow(7).height = 24;
}

function enquirySheet(wb: XlWorkbook, name: string, logoId: number | null, rows: ExportRow[], subtitle: string, meta: ExportMeta) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 8, showGridLines: false }] });
  ws.columns = XL_COLS.map((c) => ({ key: c.key, width: c.width }));
  banner(ws, wb, logoId, subtitle, meta, XL_COLS.length);
  summaryChips(ws, rows);
  const head = ws.getRow(8);
  XL_COLS.forEach((c, i) => {
    const cell = head.getCell(i + 1);
    cell.value = c.header;
    cell.font = { name: "Calibri", bold: true, color: { argb: "FFFFFFFF" }, size: 10.5 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEAD_FILL } };
    cell.alignment = { vertical: "middle", horizontal: c.align ?? "left", wrapText: true, indent: c.align ? 0 : 1 };
    cell.border = { right: { style: "thin", color: { argb: "FF4338CA" } } };
  });
  head.height = 30;
  rows.forEach((r, idx) => {
    const row = ws.getRow(9 + idx);
    const vals: Record<string, unknown> = {
      no: r.orderNumber, date: d(r.enquiryDate), client: r.companyName || r.customerName, contact: r.customerName,
      phone: r.customerPhone ?? "", email: r.customerEmail ?? "", gst: r.gstNumber ?? "", division: r.division.name,
      product: r.productDetails ?? "", sample: r.isSample ? "Yes" : "No", sampleSent: d(r.sampleSentAt), courier: r.sampleCourierName ?? "",
      tracking: r.sampleTrackingId ?? "", price: r.pricePerUnit ? Number(r.pricePerUnit) : null, unit: r.priceUnit ?? "",
      qty: r.quantity ?? "", terms: r.paymentTerms ?? "", delivery: r.deliveryTime ?? "", pricedBy: r.pricedBy?.name ?? "",
      resp: r.clientResponse ? RESP[r.clientResponse] ?? r.clientResponse : "", feedback: r.clientFeedback ?? "",
      status: STATUS[r.status] ?? r.status, loggedBy: r.createdBy.name,
    };
    XL_COLS.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      cell.value = vals[c.key] as never;
      if (c.fmt) cell.numFmt = c.fmt;
      cell.alignment = { vertical: "top", horizontal: c.align ?? "left", wrapText: c.key === "product" || c.key === "feedback" };
      cell.font = { name: "Calibri", size: 10.5, color: { argb: c.key === "no" ? "FF4338CA" : "FF1F2937" }, bold: c.key === "no" };
      cell.border = { bottom: { style: "hair", color: { argb: "FFCBD2DC" } } };
      cell.alignment = { vertical: "middle", horizontal: c.align ?? "left", wrapText: c.key === "product" || c.key === "feedback", indent: c.align ? 0 : 1 };
      if (idx % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
    });
    row.height = 22;
    const sc = row.getCell(XL_COLS.findIndex((c) => c.key === "status") + 1);
    const tone = ({ PLACED: ["FFFDF3E3", "FF8A5200"], PRICED: ["FFEDF2FE", "FF1E429F"], CLOSED: ["FFE9F7F4", "FF0B6B5D"], CANCELLED: ["FFF2F4F7", "FF667085"] } as Record<string, string[]>)[r.status];
    if (tone) { sc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: tone[0] } }; sc.font = { bold: true, size: 10.5, color: { argb: tone[1] } }; }
  });
  ws.autoFilter = { from: { row: 8, column: 1 }, to: { row: 8 + Math.max(rows.length, 1), column: XL_COLS.length } };
  ws.pageSetup = { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "8:8", margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.7, header: 0.3, footer: 0.3 } };
  ws.headerFooter = { oddFooter: `&L&8${COMPANY_NAME}  ·  Confidential&R&8Page &P of &N` };
  ws.properties.tabColor = { argb: "FF" + INDIGO };
  return ws;
}

export async function exportExcel(rows: ExportRow[], meta: ExportMeta) {
  const ExcelJS = (await import("exceljs")).default;
  const logo = await loadLogo();
  const wb = new ExcelJS.Workbook();
  wb.creator = COMPANY_NAME;
  wb.created = new Date();
  const logoId = logo ? wb.addImage({ buffer: logo.buffer, extension: "png" }) : null;

  if (!meta.byDivision) {
    enquirySheet(wb, "Enquiries", logoId, rows, "Enquiry report", meta);
  } else {
    const groups = groupByDivision(rows);
    // Summary sheet
    const sm = wb.addWorksheet("Summary", { views: [{ showGridLines: false }] });
    sm.columns = [{ width: 24 }, { width: 12 }, { width: 16 }, { width: 20 }, { width: 12 }, { width: 14 }, { width: 34 }];
    sm.properties.tabColor = { argb: "FF1BAF7A" };
    banner(sm, wb, logoId, "Enquiry report · division-wise summary", meta, 7);
    const hdr = ["Division", "Total", "Needs pricing", "Waiting for client", "Closed", "Cancelled", "Share of enquiries"];
    hdr.forEach((h, i) => {
      const c = sm.getCell(8, i + 1);
      c.value = h;
      c.font = { name: "Calibri", bold: true, color: { argb: "FFFFFFFF" }, size: 10.5 };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEAD_FILL } };
      c.alignment = { vertical: "middle", horizontal: i === 0 ? "left" : "center", indent: i === 0 ? 1 : 0 };
    });
    sm.getRow(8).height = 28;
    const tot = [0, 0, 0, 0, 0];
    groups.forEach(([name, g], idx) => {
      const k = counts(g);
      const vals = [name, k.total, k.PLACED, k.PRICED, k.CLOSED, k.CANCELLED];
      vals.forEach((v, i) => {
        const c = sm.getCell(9 + idx, i + 1);
        c.value = v as never;
        c.font = { size: 11, bold: i === 0, color: { argb: "FF101828" } };
        c.alignment = { horizontal: i === 0 ? "left" : "center" };
        c.border = { bottom: { style: "thin", color: { argb: "FFE6E8EC" } } };
        if (idx % 2 === 1) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFAFBFC" } };
        if (i > 0) tot[i - 1] += v as number;
      });
      const bar = sm.getCell(9 + idx, 7);
      const share = rows.length ? k.total / rows.length : 0;
      bar.value = `${"█".repeat(Math.max(1, Math.round(share * 22)))}  ${Math.round(share * 100)}%`;
      bar.font = { name: "Calibri", size: 10, color: { argb: "FF4F46E5" } };
      bar.alignment = { vertical: "middle" };
      bar.border = { bottom: { style: "thin", color: { argb: "FFE6E8EC" } } };
      sm.getRow(9 + idx).height = 22;
    });
    const tr = 9 + groups.length;
    ["All divisions", ...tot].forEach((v, i) => {
      const c = sm.getCell(tr, i + 1);
      c.value = v as never;
      c.font = { bold: true, size: 11, color: { argb: "FF3730A3" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF0FF" } };
      c.alignment = { horizontal: i === 0 ? "left" : "center" };
    });
    const used = new Set<string>(["summary"]);
    groups.forEach(([name, g]) => enquirySheet(wb, safeSheet(name, used), logoId, g, `Enquiry report · ${name}`, meta));
  }

  const buf = await wb.xlsx.writeBuffer();
  download(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `enquiries${meta.byDivision ? "-by-division" : ""}-${fileStamp()}.xlsx`);
}

/* ────────────────────────────── PDF ────────────────────────────── */
type RGB = [number, number, number];
const STATUS_PILL: Record<string, { bg: RGB; fg: RGB; bar: RGB }> = {
  "Needs pricing": { bg: [253, 243, 227], fg: [138, 82, 0], bar: [237, 161, 0] },
  "Waiting for client": { bg: [237, 242, 254], fg: [30, 66, 159], bar: [55, 138, 221] },
  Closed: { bg: [233, 247, 244], fg: [11, 107, 93], bar: [27, 175, 122] },
  Cancelled: { bg: [242, 244, 247], fg: [102, 112, 133], bar: [152, 162, 179] },
};

export async function exportPdf(rows: ExportRow[], meta: ExportMeta) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const logo = await loadLogo();
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 14;
  const INK: RGB = [17, 24, 39];
  const SLATE: RGB = [71, 84, 103];
  const GREY: RGB = [118, 128, 145];
  const BRAND: RGB = [79, 70, 229];
  const BRAND_DARK: RGB = [55, 48, 163];
  const HAIR: RGB = [226, 229, 235];
  const SOFT: RGB = [248, 249, 252];

  /* Solid white behind every page so colours stay true in dark-mode viewers and previews */
  const painted = new Set<number>();
  const paint = () => {
    const n = doc.getCurrentPageInfo().pageNumber;
    if (painted.has(n)) return;
    painted.add(n);
    doc.setFillColor(255, 255, 255).rect(0, 0, W, H, "F");
  };
  paint();

  /* Letterhead */
  if (logo) doc.addImage(logo.dataUrl, "PNG", M, 10, 21, 21);
  const tx = logo ? M + 27 : M;
  doc.setFont("helvetica", "bold").setFontSize(18).setTextColor(...INK).text(COMPANY_NAME, tx, 17.5);
  doc.setFont("helvetica", "bold").setFontSize(8.5).setTextColor(...BRAND).text("ENQUIRY REPORT" + (meta.byDivision ? "  ·  DIVISION-WISE" : ""), tx, 24, { charSpace: 0.9 });
  doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(...GREY).text("Enquiry Management System", tx, 29);
  doc.setFontSize(7.5).setTextColor(...GREY).text("GENERATED", W - M, 14.5, { align: "right", charSpace: 0.6 });
  doc.setFontSize(9.5).setTextColor(...INK).text(stamp(), W - M, 19.5, { align: "right" });
  doc.setFontSize(7.5).setTextColor(...GREY).text("PREPARED BY", W - M, 25, { align: "right", charSpace: 0.6 });
  doc.setFontSize(9.5).setTextColor(...INK).text(meta.generatedBy, W - M, 30, { align: "right" });
  doc.setFillColor(...BRAND).rect(M, 35, W - M * 2, 0.8, "F");

  /* Filter chips */
  let cx = M;
  const chips = meta.filters.length ? meta.filters : ["All enquiries you can see"];
  doc.setFont("helvetica", "normal").setFontSize(8);
  doc.setTextColor(...GREY).text("Showing", cx, 42.1);
  cx += doc.getTextWidth("Showing") + 3;
  chips.forEach((t) => {
    const w = doc.getTextWidth(t) + 7;
    if (cx + w > W - M) return;
    doc.setFillColor(...SOFT).setDrawColor(...HAIR).setLineWidth(0.2).roundedRect(cx, 38.6, w, 6.2, 3.1, 3.1, "FD");
    doc.setTextColor(...SLATE).text(t, cx + 3.5, 42.8);
    cx += w + 2.5;
  });

  /* Summary cards */
  const k = counts(rows);
  const cards: [string, number, RGB][] = [["Total enquiries", k.total, BRAND], ["Needs pricing", k.PLACED, STATUS_PILL["Needs pricing"].bar], ["Waiting for client", k.PRICED, STATUS_PILL["Waiting for client"].bar], ["Closed", k.CLOSED, STATUS_PILL.Closed.bar]];
  const cw = (W - M * 2 - 9) / 4;
  cards.forEach(([label, n, col], i) => {
    const x = M + i * (cw + 3);
    doc.setFillColor(255, 255, 255).setDrawColor(...HAIR).setLineWidth(0.25).roundedRect(x, 50, cw, 18, 2.5, 2.5, "FD");
    doc.setFillColor(...col).circle(x + 5.2, 56.2, 1.1, "F");
    doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(...GREY).text(label, x + 8, 57);
    doc.setFont("helvetica", "bold").setFontSize(18).setTextColor(...INK).text(String(n), x + 5, 65);
  });

  /* Status mix bar */
  const mix: [string, number][] = [["Needs pricing", k.PLACED], ["Waiting for client", k.PRICED], ["Closed", k.CLOSED], ["Cancelled", k.CANCELLED]];
  const barW = W - M * 2;
  doc.setFont("helvetica", "bold").setFontSize(7.5).setTextColor(...GREY).text("STATUS MIX", M, 75, { charSpace: 0.6 });
  doc.setFillColor(...SOFT).roundedRect(M, 77, barW, 3.4, 1.7, 1.7, "F");
  let bx = M;
  mix.forEach(([label, n]) => {
    if (!n || !k.total) return;
    const w = (n / k.total) * barW;
    doc.setFillColor(...STATUS_PILL[label].bar).rect(bx, 77, w, 3.4, "F");
    bx += w;
  });
  let lx = M;
  doc.setFont("helvetica", "normal").setFontSize(8);
  mix.forEach(([label, n]) => {
    if (!n) return;
    const t = `${label}  ${n} (${k.total ? Math.round((n / k.total) * 100) : 0}%)`;
    doc.setFillColor(...STATUS_PILL[label].bar).circle(lx + 1, 84.3, 1, "F");
    doc.setTextColor(...SLATE).text(t, lx + 3.5, 85);
    lx += doc.getTextWidth(t) + 11;
  });

  const price = (r: ExportRow) => (r.pricePerUnit ? `Rs. ${Number(r.pricePerUnit).toLocaleString("en-IN", { minimumFractionDigits: 2 })} / ${r.priceUnit ?? ""}` : "-");
  const body = (g: ExportRow[], withDivision: boolean) =>
    g.map((r) => [
      r.orderNumber, fmtD(r.enquiryDate), r.companyName || r.customerName, ...(withDivision ? [r.division.name] : []),
      r.isSample ? "Yes" : "No", price(r), r.clientResponse ? RESP[r.clientResponse] ?? "" : "-", STATUS[r.status] ?? r.status, r.createdBy.name,
    ]);
  const heads = (withDivision: boolean) => ["ENQUIRY", "DATE", "CLIENT", ...(withDivision ? ["DIVISION"] : []), "SAMPLE", "PRICE", "CLIENT RESPONSE", "STATUS", "LOGGED BY"];

  const tableOpts = (withDivision: boolean, startY: number, g: ExportRow[]) => {
    const sampleCol = withDivision ? 4 : 3;
    const priceCol = withDivision ? 5 : 4;
    const statusCol = withDivision ? 7 : 6;
    return {
      startY,
      margin: { left: M, right: M, top: 16, bottom: 17 },
      head: [heads(withDivision)],
      body: body(g, withDivision),
      theme: "plain" as const,
      styles: { font: "helvetica", fontSize: 8.5, cellPadding: { top: 3, bottom: 3, left: 2.6, right: 2.6 }, textColor: INK, lineColor: HAIR, lineWidth: { bottom: 0.2 } as never },
      headStyles: { fillColor: SOFT, textColor: SLATE, fontStyle: "bold" as const, fontSize: 7, cellPadding: { top: 3.4, bottom: 3.4, left: 2.6, right: 2.6 } },
      columnStyles: { 0: { fontStyle: "bold" as const, textColor: BRAND_DARK, cellWidth: 24 }, 1: { cellWidth: 25 }, [sampleCol]: { cellWidth: 16 }, [statusCol]: { cellWidth: 38 } },
      willDrawPage: () => paint(),
      didParseCell: (h: import("jspdf-autotable").CellHookData) => {
        const i = h.column.index;
        if (i === sampleCol) h.cell.styles.halign = "center";
        if (i === priceCol) h.cell.styles.halign = "right";
        if (h.section === "body" && i === statusCol) h.cell.text = [""]; // drawn as a pill below
      },
      didDrawCell: (h: import("jspdf-autotable").CellHookData) => {
        if (h.section === "head") {
          doc.setDrawColor(...BRAND).setLineWidth(0.5).line(h.cell.x, h.cell.y + h.cell.height, h.cell.x + h.cell.width, h.cell.y + h.cell.height);
          return;
        }
        if (h.column.index !== statusCol) return;
        const label = STATUS[g[h.row.index].status] ?? "";
        const pill = STATUS_PILL[label] ?? STATUS_PILL.Cancelled;
        doc.setFont("helvetica", "bold").setFontSize(7.5);
        const w = doc.getTextWidth(label) + 7;
        const y = h.cell.y + (h.cell.height - 5.6) / 2;
        doc.setFillColor(...pill.bg).roundedRect(h.cell.x + 2, y, w, 5.6, 2.8, 2.8, "F");
        doc.setFillColor(...pill.bar).circle(h.cell.x + 4.6, y + 2.8, 0.85, "F");
        doc.setTextColor(...pill.fg).text(label, h.cell.x + 6.4, y + 3.9);
      },
      didDrawPage: () => {
        doc.setDrawColor(...HAIR).setLineWidth(0.2).line(M, H - 12, W - M, H - 12);
        doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(...GREY).text(`${COMPANY_NAME}   ·   Confidential, for internal use`, M, H - 7);
      },
    };
  };

  if (!meta.byDivision) {
    autoTable(doc, tableOpts(true, 92, rows));
  } else {
    const groups = groupByDivision(rows);
    // Division overview
    autoTable(doc, {
      startY: 92,
      margin: { left: M, right: M, bottom: 17 },
      theme: "plain",
      head: [["DIVISION OVERVIEW", "TOTAL", "NEEDS PRICING", "WAITING FOR CLIENT", "CLOSED", "SHARE"]],
      body: groups.map(([name, g]) => { const c = counts(g); return [name, c.total, c.PLACED, c.PRICED, c.CLOSED, `${k.total ? Math.round((c.total / k.total) * 100) : 0}%`]; }),
      styles: { font: "helvetica", fontSize: 9, cellPadding: { top: 3, bottom: 3, left: 2.6, right: 2.6 }, textColor: INK, lineColor: HAIR, lineWidth: { bottom: 0.2 } as never },
      headStyles: { fillColor: SOFT, textColor: SLATE, fontStyle: "bold", fontSize: 7, halign: "left" },
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 60 }, 1: { halign: "center" }, 2: { halign: "center" }, 3: { halign: "center" }, 4: { halign: "center" }, 5: { halign: "center" } },
      willDrawPage: () => paint(),
      didParseCell: (h) => { if (h.section === "head" && h.column.index > 0) h.cell.styles.halign = "center"; },
      didDrawCell: (h) => { if (h.section === "head") doc.setDrawColor(...BRAND).setLineWidth(0.5).line(h.cell.x, h.cell.y + h.cell.height, h.cell.x + h.cell.width, h.cell.y + h.cell.height); },
      didDrawPage: () => {
        doc.setDrawColor(...HAIR).setLineWidth(0.2).line(M, H - 12, W - M, H - 12);
        doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(...GREY).text(`${COMPANY_NAME}   ·   Confidential, for internal use`, M, H - 7);
      },
    });
    let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;
    for (const [name, g] of groups) {
      if (y > H - 60) { doc.addPage(); paint(); y = 22; }
      const gk = counts(g);
      doc.setFillColor(...BRAND).roundedRect(M, y - 4.4, 1.5, 6.6, 0.75, 0.75, "F");
      doc.setFont("helvetica", "bold").setFontSize(13).setTextColor(...INK).text(name, M + 4.5, y + 0.6);
      doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(...GREY)
        .text(`${gk.total} enquiries   ·   ${gk.PLACED} need pricing   ·   ${gk.PRICED} waiting for client   ·   ${gk.CLOSED} closed`, W - M, y + 0.4, { align: "right" });
      autoTable(doc, tableOpts(false, y + 4.5, g));
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;
    }
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(...GREY).text(`Page ${i} of ${pages}`, W - M, H - 7, { align: "right" });
  }
  doc.save(`enquiries${meta.byDivision ? "-by-division" : ""}-${fileStamp()}.pdf`);
}
