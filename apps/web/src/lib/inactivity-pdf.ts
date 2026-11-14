/**
 * 15-day inactivity report as a PDF: one titled section per organization, listing the Marketing people
 * who have not logged an enquiry. Pure rendering (no database), data is gathered in inactivity.ts.
 */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { APP_NAME, COMPANY_NAME } from "@/lib/branding";
import { loadLogo } from "@/lib/weekly-report-render";

export type InactiveRow = {
  name: string; email: string; divisions: string[]; days: number;
  /** null = never entered an enquiry */
  last: { orderNumber: string; client: string; at: Date } | null;
  joinedAt: Date;
};
export type InactiveSection = { title: string; rows: InactiveRow[] };
export type InactivityReport = { thresholdDays: number; generatedAt: Date; sections: InactiveSection[] };

type RGB = [number, number, number];
const INDIGO: RGB = [79, 70, 229], INDIGO_D: RGB = [67, 56, 202], TINT: RGB = [238, 240, 255];
const INK: RGB = [16, 24, 40], MUTE: RGB = [102, 112, 133], LINE: RGB = [230, 232, 242], SOFT: RGB = [247, 248, 252];
const IST = "Asia/Kolkata";
const dLong = (d: Date) => d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: IST });

export function inactivityFileName(r: InactivityReport) {
  return `Inactivity-Report-${r.generatedAt.toLocaleDateString("en-CA", { timeZone: IST })}.pdf`;
}

export function inactivityTotal(r: InactivityReport) {
  return r.sections.reduce((n, s) => n + s.rows.length, 0);
}

export async function renderInactivityPdf(report: InactivityReport): Promise<Buffer> {
  const logo = await loadLogo();
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const M = 16, CW = W - 2 * M;
  const lastY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  let y = 47;
  doc.setFont("helvetica", "bold").setFontSize(20).setTextColor(...INK).text("Nil enquiries", M, y); y += 6.5;
  doc.setFont("helvetica", "normal").setFontSize(9.5).setTextColor(...MUTE)
    .text(`Marketing people with no enquiry entered in ${report.thresholdDays} days or more · ${inactivityTotal(report)} in total · ${dLong(report.generatedAt)}`, M, y);
  y += 9;

  report.sections.forEach((sec) => {
    if (y + 40 > H - 20) { doc.addPage(); y = 47; }
    doc.setFillColor(...TINT).roundedRect(M, y - 7, CW, 14, 3, 3, "F");
    doc.setFillColor(...INDIGO).roundedRect(M, y - 7, 2.2, 14, 1, 1, "F");
    doc.setFont("helvetica", "bold").setFontSize(15).setTextColor(...INDIGO_D).text(sec.title, M + 7, y + 2.2);
    doc.setFontSize(9).setTextColor(...MUTE).text(`${sec.rows.length} ${sec.rows.length === 1 ? "person" : "people"}`, W - M - 4, y + 2, { align: "right" });
    y += 11;
    autoTable(doc, {
      startY: y, margin: { left: M, right: M, top: 42 },
      head: [["Person", "Divisions", "Last entry", "Days"]],
      body: sec.rows.map((r) => [
        `${r.name}\n${r.email}`,
        r.divisions.join(", ") || "-",
        r.last ? `${r.last.orderNumber} · ${r.last.client}\n${dLong(r.last.at)}` : `Never entered one\nJoined ${dLong(r.joinedAt)}`,
        String(r.days),
      ]),
      theme: "plain",
      styles: { font: "helvetica", fontSize: 8.5, cellPadding: { top: 2.6, bottom: 2.6, left: 3, right: 3 }, textColor: INK, lineColor: LINE, lineWidth: { bottom: 0.2 }, valign: "middle" },
      headStyles: { fillColor: INDIGO, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7.5, lineWidth: 0 },
      alternateRowStyles: { fillColor: SOFT },
      columnStyles: { 0: { cellWidth: 58, fontStyle: "bold" }, 1: { cellWidth: 40, textColor: MUTE }, 2: { textColor: MUTE }, 3: { cellWidth: 14, halign: "center", fontStyle: "bold", textColor: [190, 18, 60] } },
      didParseCell: (h) => { if (h.section === "head" && h.column.index === 3) h.cell.styles.halign = "center"; },
    });
    y = lastY() + 14;
  });

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFillColor(...INDIGO).rect(0, 0, W, 34, "F");
    doc.setFillColor(255, 255, 255).roundedRect(M, 8, 18, 18, 3.5, 3.5, "F");
    if (logo) doc.addImage(logo, "PNG", M + 2, 10, 14, 14);
    doc.setFont("helvetica", "bold").setFontSize(15).setTextColor(255, 255, 255).text(COMPANY_NAME, M + 23, 16.5);
    doc.setFontSize(7.5).setTextColor(199, 210, 254).text(APP_NAME.toUpperCase(), M + 23, 22, { charSpace: 0.4 });
    doc.setFontSize(9).setTextColor(255, 255, 255).text("INACTIVITY REPORT", W - M, 15, { align: "right" });
    doc.setFont("helvetica", "normal").setTextColor(224, 231, 255).text(`${report.thresholdDays}+ days without an enquiry`, W - M, 20.5, { align: "right" });
    doc.setDrawColor(...LINE).setLineWidth(0.2).line(M, H - 14, W - M, H - 14);
    doc.setFontSize(7.5).setTextColor(...MUTE)
      .text(`${COMPANY_NAME} · ${APP_NAME} · Confidential, for management use`, M, H - 9)
      .text(`Page ${i} of ${pages}`, W - M, H - 9, { align: "right" });
  }
  return Buffer.from(doc.output("arraybuffer"));
}
