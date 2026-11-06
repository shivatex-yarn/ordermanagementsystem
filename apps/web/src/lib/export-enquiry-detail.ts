/** Download one enquiry's full details as a PDF or an Excel workbook, with the company logo. */
import { COMPANY_NAME } from "@/lib/branding";
import { download, fileStamp, fmtD, loadLogo, RESP, STATUS, stamp } from "@/lib/export-enquiries";

export type EnquiryDetail = {
  orderNumber: string; status: string; enquiryDate: string;
  customerName: string; companyName: string | null; customerPhone: string | null; customerEmail: string | null; customerAddress: string | null;
  gstNumber: string | null; productDetails: string | null; isSample: boolean;
  sampleSentAt: string | null; sampleCourierName: string | null; sampleTrackingId: string | null; sampleRemarks: string | null;
  pricePerUnit: string | null; priceUnit: string | null; quantity: string | null; paymentTerms: string | null; deliveryTime: string | null; pricingNotes: string | null;
  pricedAt: string | null; pricedBy: { name: string } | null;
  clientResponse: string | null; clientFeedback: string | null; clientFeedbackAt: string | null; cancellationReason: string | null;
  division: { name: string }; createdBy: { name: string };
  timelineEvents: { title: string; detail: string | null; createdAt: string; actor: { name: string } | null }[];
};

const rupee = (n: string | null, prefix: string) => (n ? `${prefix}${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "-");
const dt = (v: string | null) => (v ? new Date(v).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-");
const or = (v: string | null | undefined) => (v && v.trim() ? v : "-");

type RGB = [number, number, number];
const PILL: Record<string, { bg: RGB; fg: RGB; bar: RGB }> = {
  PLACED: { bg: [253, 243, 227], fg: [138, 82, 0], bar: [237, 161, 0] },
  PRICED: { bg: [237, 242, 254], fg: [30, 66, 159], bar: [55, 138, 221] },
  CLOSED: { bg: [233, 247, 244], fg: [11, 107, 93], bar: [27, 175, 122] },
  CANCELLED: { bg: [242, 244, 247], fg: [102, 112, 133], bar: [152, 162, 179] },
};

/* ───────────────────────────── PDF ───────────────────────────── */
export async function exportEnquiryPdf(o: EnquiryDetail, generatedBy: string) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const logo = await loadLogo();
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 15;
  const CW = W - M * 2;
  const INK: RGB = [17, 24, 39], SLATE: RGB = [71, 84, 103], GREY: RGB = [118, 128, 145], BRAND: RGB = [79, 70, 229], HAIR: RGB = [226, 229, 235], SOFT: RGB = [248, 249, 252];

  const painted = new Set<number>();
  const paint = () => {
    const n = doc.getCurrentPageInfo().pageNumber;
    if (painted.has(n)) return;
    painted.add(n);
    doc.setFillColor(255, 255, 255).rect(0, 0, W, H, "F");
  };
  const footer = () => {
    doc.setDrawColor(...HAIR).setLineWidth(0.2).line(M, H - 12, W - M, H - 12);
    doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(...GREY).text(`${COMPANY_NAME}   ·   Confidential, for internal use`, M, H - 7);
  };
  paint();

  /* Letterhead */
  if (logo) doc.addImage(logo.dataUrl, "PNG", M, 10, 20, 20);
  const tx = logo ? M + 26 : M;
  doc.setFont("helvetica", "bold").setFontSize(17).setTextColor(...INK).text(COMPANY_NAME, tx, 17);
  doc.setFontSize(8.5).setTextColor(...BRAND).text("ENQUIRY DETAILS", tx, 23.5, { charSpace: 0.9 });
  doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(...GREY).text("Enquiry Management System", tx, 28.5);
  doc.setFontSize(7.5).text("GENERATED", W - M, 14, { align: "right", charSpace: 0.6 });
  doc.setFontSize(9).setTextColor(...INK).text(stamp(), W - M, 19, { align: "right" });
  doc.setFontSize(7.5).setTextColor(...GREY).text("PREPARED BY", W - M, 24.5, { align: "right", charSpace: 0.6 });
  doc.setFontSize(9).setTextColor(...INK).text(generatedBy, W - M, 29.5, { align: "right" });
  doc.setFillColor(...BRAND).rect(M, 34, CW, 0.8, "F");

  /* Title row */
  doc.setFont("helvetica", "bold").setFontSize(22).setTextColor(...INK).text(o.orderNumber, M, 47);
  const label = STATUS[o.status] ?? o.status;
  const pill = PILL[o.status] ?? PILL.CANCELLED;
  doc.setFontSize(8);
  const pw = doc.getTextWidth(label) + 9;
  const nx = M + doc.setFontSize(22).getTextWidth(o.orderNumber) + 5;
  doc.setFillColor(...pill.bg).roundedRect(nx, 41.4, pw, 6.4, 3.2, 3.2, "F");
  doc.setFillColor(...pill.bar).circle(nx + 3.6, 44.6, 1, "F");
  doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(...pill.fg).text(label, nx + 6, 45);
  doc.setFont("helvetica", "normal").setFontSize(9.5).setTextColor(...GREY).text(`${o.companyName || o.customerName}   ·   ${o.division.name}   ·   Enquiry date ${fmtD(o.enquiryDate)}`, M, 53.5);

  /* Progress stepper */
  const steps = [
    { l: "Logged", d: true }, { l: "Priced", d: !!o.pricedAt },
    ...(o.isSample ? [{ l: "Sample", d: !!o.sampleSentAt }] : []),
    { l: "Client replied", d: !!o.clientResponse }, { l: "Closed", d: o.status === "CLOSED" },
  ];
  const sy = 66, gap = CW / steps.length;
  steps.forEach((s, i) => {
    const cx = M + gap * i + gap / 2;
    if (i > 0) doc.setDrawColor(...(s.d ? BRAND : HAIR)).setLineWidth(0.6).line(M + gap * (i - 1) + gap / 2 + 3.6, sy, cx - 3.6, sy);
    if (s.d) { doc.setFillColor(...BRAND).circle(cx, sy, 3.2, "F"); doc.setDrawColor(255, 255, 255).setLineWidth(0.7).lines([[1.1, 1.1], [1.9, -2.6]], cx - 1.6, sy + 0.1, [1, 1], "S"); }
    else doc.setFillColor(255, 255, 255).setDrawColor(...HAIR).setLineWidth(0.5).circle(cx, sy, 3.2, "FD");
    doc.setFont("helvetica", s.d ? "bold" : "normal").setFontSize(8).setTextColor(...(s.d ? INK : GREY)).text(s.l, cx, sy + 8, { align: "center" });
  });

  /* Sections */
  let y = 84;
  const need = (h: number) => { if (y + h > H - 18) { footer(); doc.addPage(); paint(); y = 20; } };
  const section = (title: string, rows: [string, string][], opts?: { wide?: boolean }) => {
    const labelW = 38;
    const lines = rows.map(([k, v]) => ({ k, v: doc.setFont("helvetica", "normal").setFontSize(9.5).splitTextToSize(v, CW - labelW - 12) as string[] }));
    const h = 11 + lines.reduce((a, l) => a + Math.max(1, l.v.length) * 4.6 + 2.6, 0) + 2;
    need(h);
    doc.setFillColor(...SOFT).setDrawColor(...HAIR).setLineWidth(0.25).roundedRect(M, y, CW, h, 2.5, 2.5, "FD");
    doc.setFillColor(...BRAND).roundedRect(M, y, 1.5, h, 0.75, 0.75, "F");
    doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(...BRAND).text(title.toUpperCase(), M + 6, y + 6.5, { charSpace: 0.7 });
    let ry = y + 13;
    lines.forEach(({ k, v }) => {
      doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(...GREY).text(k, M + 6, ry);
      doc.setFont("helvetica", "bold").setFontSize(9.5).setTextColor(...INK).text(v, M + 6 + labelW, ry);
      ry += Math.max(1, v.length) * 4.6 + 2.6;
    });
    y += h + 5;
    void opts;
  };

  section("Client", [
    ["Contact person", or(o.customerName)], ["Company", or(o.companyName)], ["Phone", or(o.customerPhone)], ["Email", or(o.customerEmail)],
    ["GST number", or(o.gstNumber)], ["Address", or(o.customerAddress)],
  ]);
  section("Requirement", [["Division", o.division.name], ["Is a sample?", o.isSample ? "Yes" : "No"], ["Details", or(o.productDetails)], ["Logged by", o.createdBy.name]]);
  section("Pricing", o.pricedAt
    ? [["Rate", o.pricePerUnit ? `${rupee(o.pricePerUnit, "Rs. ")} per ${o.priceUnit ?? ""}` : "-"], ["Quantity", or(o.quantity)], ["Payment terms", or(o.paymentTerms)], ["Delivery time", or(o.deliveryTime)], ["Notes", or(o.pricingNotes)], ["Priced by", `${o.pricedBy?.name ?? "-"}  ·  ${dt(o.pricedAt)}`]]
    : [["Status", "Not priced yet"]]);
  if (o.isSample) section("Sample", [["Sent on", fmtD(o.sampleSentAt) || "-"], ["Courier", or(o.sampleCourierName)], ["Tracking ID", or(o.sampleTrackingId)], ["Remarks", or(o.sampleRemarks)]]);
  section("Client feedback", o.clientFeedback
    ? [["Response", RESP[o.clientResponse ?? ""] ?? or(o.clientResponse)], ["Feedback", o.clientFeedback], ["Recorded", dt(o.clientFeedbackAt)]]
    : [["Status", "No feedback recorded yet"]]);
  if (o.cancellationReason) section("Cancellation", [["Reason", o.cancellationReason]]);

  /* History */
  need(30);
  doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(...BRAND).text("HISTORY", M, y + 2, { charSpace: 0.7 });
  autoTable(doc, {
    startY: y + 5,
    margin: { left: M, right: M, top: 18, bottom: 17 },
    theme: "plain",
    head: [["WHEN", "EVENT", "BY"]],
    body: [...o.timelineEvents].reverse().map((e) => [dt(e.createdAt), e.detail ? `${e.title}: ${e.detail}` : e.title, e.actor?.name ?? "System"]),
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: { top: 2.6, bottom: 2.6, left: 2.4, right: 2.4 }, textColor: INK, lineColor: HAIR, lineWidth: { bottom: 0.2 } as never },
    headStyles: { fillColor: SOFT, textColor: SLATE, fontStyle: "bold", fontSize: 7 },
    columnStyles: { 0: { cellWidth: 38 }, 2: { cellWidth: 34 } },
    willDrawPage: () => paint(),
    didDrawCell: (h) => { if (h.section === "head") doc.setDrawColor(...BRAND).setLineWidth(0.5).line(h.cell.x, h.cell.y + h.cell.height, h.cell.x + h.cell.width, h.cell.y + h.cell.height); },
    didDrawPage: footer,
  });
  if (!o.timelineEvents.length) footer();

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(...GREY).text(`Page ${i} of ${pages}`, W - M, H - 7, { align: "right" });
  }
  doc.save(`${o.orderNumber}-details-${fileStamp()}.pdf`);
}

/* ──────────────────────────── Excel ──────────────────────────── */
export async function exportEnquiryExcel(o: EnquiryDetail, generatedBy: string) {
  const ExcelJS = (await import("exceljs")).default;
  const logo = await loadLogo();
  const wb = new ExcelJS.Workbook();
  wb.creator = COMPANY_NAME;
  wb.created = new Date();
  const ws = wb.addWorksheet("Enquiry", { views: [{ showGridLines: false }] });
  ws.properties.tabColor = { argb: "FF4F46E5" };
  ws.columns = [{ width: 24 }, { width: 62 }];

  ws.mergeCells(1, 1, 4, 1);
  if (logo) ws.addImage(wb.addImage({ buffer: logo.buffer, extension: "png" }), { tl: { col: 0.1, row: 0.1 }, ext: { width: 84, height: 84 } });
  for (let r = 1; r <= 4; r++) ws.getRow(r).height = 21;
  ws.mergeCells(1, 2, 1, 2);
  Object.assign(ws.getCell(1, 2), { value: COMPANY_NAME });
  ws.getCell(1, 2).font = { name: "Calibri", size: 20, bold: true, color: { argb: "FF1F2937" } };
  ws.mergeCells(2, 2, 2, 2);
  ws.getCell(2, 2).value = "ENQUIRY DETAILS";
  ws.getCell(2, 2).font = { name: "Calibri", size: 11, bold: true, color: { argb: "FF4F46E5" } };
  ws.mergeCells(3, 2, 3, 2);
  ws.getCell(3, 2).value = `Generated ${stamp()} by ${generatedBy}`;
  ws.getCell(3, 2).font = { size: 10, color: { argb: "FF667085" } };
  for (let c = 1; c <= 2; c++) ws.getCell(5, c).border = { top: { style: "medium", color: { argb: "FF4F46E5" } } };
  ws.getRow(5).height = 6;

  ws.mergeCells(6, 1, 6, 2);
  const title = ws.getCell(6, 1);
  title.value = `${o.orderNumber}   ·   ${STATUS[o.status] ?? o.status}   ·   ${o.companyName || o.customerName}   ·   ${o.division.name}`;
  title.font = { name: "Calibri", size: 14, bold: true, color: { argb: "FF312E81" } };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF0FF" } };
  title.alignment = { vertical: "middle", indent: 1 };
  ws.getRow(6).height = 30;

  let r = 8;
  const block = (name: string, rows: [string, string | number | null][]) => {
    ws.mergeCells(r, 1, r, 2);
    const h = ws.getCell(r, 1);
    h.value = name.toUpperCase();
    h.font = { name: "Calibri", bold: true, size: 10.5, color: { argb: "FFFFFFFF" } };
    h.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF312E81" } };
    h.alignment = { vertical: "middle", indent: 1 };
    ws.getRow(r).height = 24;
    r++;
    rows.forEach(([k, v], i) => {
      const a = ws.getCell(r, 1), b = ws.getCell(r, 2);
      a.value = k;
      b.value = v === null || v === "" ? "-" : v;
      a.font = { name: "Calibri", size: 10.5, color: { argb: "FF667085" } };
      b.font = { name: "Calibri", size: 10.5, bold: true, color: { argb: "FF1F2937" } };
      a.alignment = { vertical: "top", indent: 1 };
      b.alignment = { vertical: "top", wrapText: true, horizontal: "left" };
      const fill = i % 2 ? { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFF8FAFC" } } : undefined;
      if (fill) { a.fill = fill; b.fill = fill; }
      a.border = { bottom: { style: "hair", color: { argb: "FFCBD2DC" } } };
      b.border = { bottom: { style: "hair", color: { argb: "FFCBD2DC" } } };
      ws.getRow(r).height = Math.max(20, Math.ceil(String(b.value).length / 70) * 16);
      r++;
    });
    r++;
  };

  block("Client", [["Contact person", o.customerName], ["Company", o.companyName], ["Phone", o.customerPhone], ["Email", o.customerEmail], ["GST number", o.gstNumber], ["Address", o.customerAddress]]);
  block("Requirement", [["Enquiry date", fmtD(o.enquiryDate)], ["Division", o.division.name], ["Is a sample?", o.isSample ? "Yes" : "No"], ["Details", o.productDetails], ["Logged by", o.createdBy.name]]);
  block("Pricing", o.pricedAt
    ? [["Rate (INR)", o.pricePerUnit ? Number(o.pricePerUnit) : null], ["Per", o.priceUnit], ["Quantity", o.quantity], ["Payment terms", o.paymentTerms], ["Delivery time", o.deliveryTime], ["Notes", o.pricingNotes], ["Priced by", `${o.pricedBy?.name ?? "-"}, ${dt(o.pricedAt)}`]]
    : [["Status", "Not priced yet"]]);
  const rateRow = ws.getRows(1, r)?.find((row) => row.getCell(1).value === "Rate (INR)");
  if (rateRow) rateRow.getCell(2).numFmt = "#,##0.00";
  if (o.isSample) block("Sample", [["Sent on", fmtD(o.sampleSentAt)], ["Courier", o.sampleCourierName], ["Tracking ID", o.sampleTrackingId], ["Remarks", o.sampleRemarks]]);
  block("Client feedback", o.clientFeedback ? [["Response", RESP[o.clientResponse ?? ""] ?? o.clientResponse], ["Feedback", o.clientFeedback], ["Recorded", dt(o.clientFeedbackAt)]] : [["Status", "No feedback recorded yet"]]);
  if (o.cancellationReason) block("Cancellation", [["Reason", o.cancellationReason]]);
  ws.pageSetup = { orientation: "portrait", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.7, header: 0.3, footer: 0.3 } };
  ws.headerFooter = { oddFooter: `&L&8${COMPANY_NAME}  ·  Confidential&R&8Page &P of &N` };

  const hs = wb.addWorksheet("Activity", { views: [{ state: "frozen", ySplit: 1, showGridLines: false }] });
  hs.properties.tabColor = { argb: "FF1BAF7A" };
  hs.columns = [{ header: "When", width: 24 }, { header: "Event", width: 60 }, { header: "By", width: 22 }];
  hs.getRow(1).eachCell((c) => { c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10.5 }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF312E81" } }; c.alignment = { vertical: "middle", indent: 1 }; });
  hs.getRow(1).height = 26;
  [...o.timelineEvents].reverse().forEach((e, i) => {
    const row = hs.addRow([dt(e.createdAt), e.detail ? `${e.title}: ${e.detail}` : e.title, e.actor?.name ?? "System"]);
    row.eachCell((c) => { c.font = { size: 10.5, color: { argb: "FF1F2937" } }; c.alignment = { vertical: "top", wrapText: true, indent: 1 }; c.border = { bottom: { style: "hair", color: { argb: "FFCBD2DC" } } }; if (i % 2) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } }; });
  });

  const buf = await wb.xlsx.writeBuffer();
  download(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${o.orderNumber}-details-${fileStamp()}.xlsx`);
}
