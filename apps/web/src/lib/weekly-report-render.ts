/**
 * Weekly enquiry report: the PDF and the cover email. Pure rendering, no database access,
 * so it can be tested with sample data. Data is gathered in weekly-report.ts.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { APP_NAME, COMPANY_NAME } from "@/lib/branding";

export type Tone = "good" | "grey" | "wait" | "warn";
export type WeeklyRow = {
  orderNumber: string; enquiryDate: Date; client: string; division: string;
  statusLabel: string; tone: Tone; price: string; response: string;
  priced: boolean; accepted: boolean; declined: boolean; open: boolean; sampleSent: boolean;
};
export type WeeklyPerson = {
  name: string; divisions: string[]; rows: WeeklyRow[];
  /** Last enquiry before this week, for people who logged nothing. */
  lastEntry: { orderNumber: string; at: Date } | null;
};
/** One organization's part of the report, e.g. title "Shivatex Yarn enquiries". */
export type WeeklySection = {
  title: string;
  people: WeeklyPerson[];
  byDivision: { name: string; count: number }[];
  attention: string[];
};
export type WeeklyData = {
  start: Date;
  /** Last day shown (Sunday), not the exclusive end. */
  endDay: Date;
  generatedAt: Date;
  sections: WeeklySection[];
};

type RGB = [number, number, number];
const INDIGO: RGB = [79, 70, 229], INDIGO_D: RGB = [67, 56, 202], TINT: RGB = [238, 240, 255];
const INK: RGB = [16, 24, 40], MUTE: RGB = [102, 112, 133], LINE: RGB = [230, 232, 242], SOFT: RGB = [247, 248, 252];
const PILL: Record<Tone, { bg: RGB; fg: RGB }> = {
  good: { bg: [233, 247, 244], fg: [11, 107, 93] },
  grey: { bg: [242, 244, 247], fg: [102, 112, 133] },
  wait: { bg: [237, 242, 254], fg: [30, 66, 159] },
  warn: { bg: [253, 243, 227], fg: [138, 82, 0] },
};

const IST = "Asia/Kolkata";
const dShort = (d: Date) => d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: IST });
const dLong = (d: Date) => d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: IST });
const dFull = (d: Date) => d.toLocaleDateString("en-IN", { weekday: "long", day: "2-digit", month: "short", year: "numeric", timeZone: IST });
const weekLabel = (d: WeeklyData) => `${dShort(d.start)} - ${dLong(d.endDay)}`;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const initials = (n: string) => n.split(/\s+/).filter(Boolean).map((x) => x[0]).join("").slice(0, 2).toUpperCase();
const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "") || "http://localhost:3000";

export function totalsOf(d: WeeklyData | WeeklySection) {
  const rows = ("sections" in d ? d.sections.flatMap((s) => s.people) : d.people).flatMap((p) => p.rows);
  return {
    logged: rows.length,
    priced: rows.filter((r) => r.priced).length,
    accepted: rows.filter((r) => r.accepted).length,
    declined: rows.filter((r) => r.declined).length,
    open: rows.filter((r) => r.open).length,
    samples: rows.filter((r) => r.sampleSent).length,
  };
}
const countsOf = (rows: WeeklyRow[]) => ({
  logged: rows.length, priced: rows.filter((r) => r.priced).length, accepted: rows.filter((r) => r.accepted).length,
  declined: rows.filter((r) => r.declined).length, open: rows.filter((r) => r.open).length,
});

export function weeklyFileName(d: WeeklyData) {
  const f = (x: Date) => x.toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: IST }).replace(/\s/g, "");
  return `Weekly-Enquiry-Report-${f(d.start)}-${f(d.endDay)}-${d.endDay.toLocaleDateString("en-GB", { year: "numeric", timeZone: IST })}.pdf`;
}

export async function loadLogo(): Promise<string | null> {
  try {
    const res = await fetch(`${appUrl()}/company-logo.png`, { signal: AbortSignal.timeout(5000) });
    if (res.ok) return `data:image/png;base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
  } catch { /* fall back to the file on disk */ }
  try {
    return `data:image/png;base64,${(await readFile(path.join(process.cwd(), "public", "company-logo.png"))).toString("base64")}`;
  } catch {
    return null;
  }
}

/* ───────────────────────────── PDF ───────────────────────────── */
export async function renderWeeklyPdf(data: WeeklyData): Promise<Buffer> {
  const logo = await loadLogo();
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const M = 16, CW = W - 2 * M;
  const lastY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  const heading = (text: string, y: number, size = 12) => { doc.setFont("helvetica", "bold").setFontSize(size).setTextColor(...INK).text(text, M, y); };

  const sectionBanner = (title: string, y: number) => {
    doc.setFillColor(...TINT).roundedRect(M, y - 7, CW, 14, 3, 3, "F");
    doc.setFillColor(...INDIGO).roundedRect(M, y - 7, 2.2, 14, 1, 1, "F");
    doc.setFont("helvetica", "bold").setFontSize(17).setTextColor(...INDIGO_D).text(title, M + 7, y + 2.6);
    return y + 14;
  };
  let y = 47;
  data.sections.forEach((sec, si) => {
  if (si > 0) { doc.addPage(); y = 47; }
  const T = totalsOf(sec);
  y = sectionBanner(sec.title, y + 3);
  heading("Week at a glance", y, 14); y += 6;
  doc.setFont("helvetica", "normal").setFontSize(9.5).setTextColor(...MUTE)
    .text(`Enquiries logged ${dFull(data.start)} to ${dFull(data.endDay)} · Generated ${dFull(data.generatedAt)}, ${data.generatedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: IST })} IST`, M, y);
  y += 8;
  const kpis: [string, number, RGB][] = [["Logged", T.logged, INDIGO], ["Priced", T.priced, [55, 138, 221]], ["Accepted", T.accepted, [27, 175, 122]], ["Declined", T.declined, [152, 162, 179]], ["Still open", T.open, [237, 161, 0]], ["Samples sent", T.samples, [124, 58, 237]]];
  const gap = 3, kw = (CW - gap * 5) / 6;
  kpis.forEach(([label, v, col], i) => {
    const x = M + i * (kw + gap);
    doc.setFillColor(...SOFT).setDrawColor(...LINE).setLineWidth(0.25).roundedRect(x, y, kw, 20, 3, 3, "FD");
    doc.setFillColor(...col).roundedRect(x + 0.1, y + 4, 1.2, 12, 0.6, 0.6, "F");
    doc.setFont("helvetica", "bold").setFontSize(6.8).setTextColor(...MUTE).text(label.toUpperCase(), x + 5, y + 7.5);
    doc.setFontSize(20).setTextColor(...INK).text(String(v), x + 5, y + 16);
  });
  y += 30;

  heading("Team performance", y); y += 3;
  autoTable(doc, {
    startY: y, margin: { left: M, right: M, top: 42 },
    head: [["Person", "Divisions", "Logged", "Priced", "Accepted", "Declined", "Open"]],
    body: sec.people.map((p) => { const c = countsOf(p.rows); return [p.name, p.divisions.join(", ") || "-", c.logged === 0 ? "0 · no entry" : String(c.logged), String(c.priced), String(c.accepted), String(c.declined), String(c.open)]; }),
    theme: "plain",
    styles: { font: "helvetica", fontSize: 9, cellPadding: { top: 2.6, bottom: 2.6, left: 3, right: 3 }, textColor: INK, lineColor: LINE, lineWidth: { bottom: 0.2 }, valign: "middle" },
    headStyles: { fillColor: INDIGO, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7.5, lineWidth: 0 },
    alternateRowStyles: { fillColor: SOFT },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 38 }, 1: { textColor: MUTE, cellWidth: 48 }, 2: { halign: "center" }, 3: { halign: "center" }, 4: { halign: "center" }, 5: { halign: "center" }, 6: { halign: "center" } },
    didParseCell: (h) => {
      if (h.section === "head" && h.column.index >= 2) h.cell.styles.halign = "center";
      if (h.section === "body" && h.column.index === 2 && String(h.cell.raw).includes("no entry")) { h.cell.styles.textColor = [190, 18, 60]; h.cell.styles.fontStyle = "bold"; }
    },
  });
  y = lastY() + 9;

  if (sec.attention.length) {
    const lines = sec.attention.flatMap((a) => doc.setFont("helvetica", "normal").setFontSize(8.8).splitTextToSize(`•  ${a}`, CW - 10) as string[]);
    const h = 12 + lines.length * 5 + 2;
    doc.setFillColor(255, 247, 237).setDrawColor(254, 215, 170).setLineWidth(0.3).roundedRect(M, y, CW, h, 3, 3, "FD");
    doc.setFont("helvetica", "bold").setFontSize(9.5).setTextColor(154, 52, 18).text("Needs attention", M + 5, y + 7);
    doc.setFont("helvetica", "normal").setFontSize(8.8).setTextColor(124, 45, 18);
    lines.forEach((l, i) => doc.text(l, M + 5, y + 13 + i * 5));
    y += h + 10;
  }

  heading("Enquiries by division", y); y += 7;
  const mx = Math.max(1, ...sec.byDivision.map((b) => b.count));
  sec.byDivision.forEach((b) => {
    doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(...MUTE).text(b.name, M, y + 2.2);
    doc.setFillColor(...LINE).roundedRect(M + 28, y - 0.8, 110, 4, 2, 2, "F");
    if (b.count) doc.setFillColor(...INDIGO).roundedRect(M + 28, y - 0.8, Math.max(4, (110 * b.count) / mx), 4, 2, 2, "F");
    doc.setFont("helvetica", "bold").setTextColor(...INK).text(String(b.count), M + 141, y + 2.2);
    y += 7;
  });

  /* ── Pages 2+: by person ── */
  doc.addPage();
  y = 47;
  y = sectionBanner(sec.title, y + 3); heading("Enquiries by person", y, 14); y += 3;
  sec.people.forEach((p) => {
    const c = countsOf(p.rows);
    const need = 14 + (p.rows.length ? 22 : 14);
    if (y + need > H - 20) { doc.addPage(); y = 47; }
    y += 6;
    doc.setFillColor(...TINT).roundedRect(M, y, CW, 13, 3, 3, "F");
    doc.setFillColor(...INDIGO).circle(M + 7, y + 6.5, 4.6, "F");
    doc.setFont("helvetica", "bold").setFontSize(8.5).setTextColor(255, 255, 255).text(initials(p.name), M + 7, y + 7.6, { align: "center" });
    doc.setFontSize(11).setTextColor(...INK).text(p.name, M + 14, y + 5.6);
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...MUTE).text(p.divisions.join(", ") || "No division mapped", M + 14, y + 10.2);
    doc.setFont("helvetica", "bold").setFontSize(8.5).setTextColor(...INDIGO_D).text(`${c.logged} logged · ${c.priced} priced · ${c.accepted} accepted · ${c.open} open`, W - M - 4, y + 7.8, { align: "right" });
    y += 15;
    if (!p.rows.length) {
      doc.setFillColor(255, 241, 242).setDrawColor(254, 205, 211).setLineWidth(0.3).roundedRect(M, y, CW, 9, 2, 2, "FD");
      const last = p.lastEntry ? `Last entry ${p.lastEntry.orderNumber} on ${dLong(p.lastEntry.at)} (${Math.floor((data.generatedAt.getTime() - p.lastEntry.at.getTime()) / 864e5)} days ago).` : "No enquiry has been entered yet.";
      doc.setFont("helvetica", "bold").setFontSize(8.5).setTextColor(190, 18, 60).text(`No enquiry entered this week. ${last}`, M + 4, y + 5.8);
      y += 13;
      return;
    }
    autoTable(doc, {
      startY: y, margin: { left: M, right: M, top: 42 },
      head: [["Enquiry", "Date", "Client", "Division", "Status", "Price", "Client response"]],
      body: p.rows.map((r) => [r.orderNumber, dShort(r.enquiryDate), r.client, r.division, r.statusLabel, r.price, r.response]),
      theme: "plain",
      styles: { font: "helvetica", fontSize: 8, cellPadding: { top: 2.4, bottom: 2.4, left: 2, right: 2 }, textColor: INK, lineColor: LINE, lineWidth: { bottom: 0.2 }, valign: "middle", overflow: "linebreak" },
      headStyles: { textColor: MUTE, fontStyle: "bold", fontSize: 7, lineWidth: { bottom: 0.2 } },
      columnStyles: { 0: { cellWidth: 19, fontStyle: "bold", textColor: INDIGO_D }, 1: { cellWidth: 14 }, 2: { cellWidth: 33 }, 3: { cellWidth: 22 }, 4: { cellWidth: 30, fontStyle: "bold", fontSize: 7.2 }, 5: { cellWidth: 28 }, 6: { textColor: MUTE } },
      didParseCell: (h) => {
        if (h.section === "body" && h.column.index === 4) {
          const tone = p.rows[h.row.index]?.tone ?? "grey";
          h.cell.styles.fillColor = PILL[tone].bg; h.cell.styles.textColor = PILL[tone].fg;
        }
      },
    });
    y = lastY() + 4;
  });
  });

  /* ── Header and footer on every page, drawn last so the page count is known ── */
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFillColor(...INDIGO).rect(0, 0, W, 34, "F");
    doc.setFillColor(255, 255, 255).roundedRect(M, 8, 18, 18, 3.5, 3.5, "F");
    if (logo) doc.addImage(logo, "PNG", M + 2, 10, 14, 14);
    doc.setFont("helvetica", "bold").setFontSize(15).setTextColor(255, 255, 255).text(COMPANY_NAME, M + 23, 16.5);
    doc.setFontSize(7.5).setTextColor(199, 210, 254).text(APP_NAME.toUpperCase(), M + 23, 22, { charSpace: 0.4 });
    doc.setFontSize(9).setTextColor(255, 255, 255).text("WEEKLY ENQUIRY REPORT", W - M, 15, { align: "right" });
    doc.setFont("helvetica", "normal").setTextColor(224, 231, 255).text(`Week of ${weekLabel(data)}`, W - M, 20.5, { align: "right" });
    doc.setDrawColor(...LINE).setLineWidth(0.2).line(M, H - 14, W - M, H - 14);
    doc.setFontSize(7.5).setTextColor(...MUTE)
      .text(`${COMPANY_NAME} · ${APP_NAME} · Confidential, for management use`, M, H - 9)
      .text(`Page ${i} of ${pages}`, W - M, H - 9, { align: "right" });
  }
  return Buffer.from(doc.output("arraybuffer"));
}

/* ───────────────────────────── Email ───────────────────────────── */
const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export function renderWeeklyEmail(data: WeeklyData, fileName: string): { subject: string; html: string; text: string } {
  const base = appUrl();
  const T = totalsOf(data);
  const subject = `Weekly enquiry report: ${weekLabel(data)}`;
  const kpi = (label: string, v: number, col: string) => `<td style="background:#f7f8fc;border:1px solid #e6e8f2;border-radius:12px;padding:14px 16px;width:33%;"><div style="font-size:10px;font-weight:800;letter-spacing:.1em;color:#667085;text-transform:uppercase;">${label}</div><div style="font-size:28px;font-weight:800;color:${col};">${v}</div></td>`;
  const cell = "border-top:1px solid #e6e8f2;";
  const block = (sec: WeeklySection) => {
    const S = totalsOf(sec);
    const rows = sec.people.map((p) => {
      const c = countsOf(p.rows);
      return `<tr><td style="padding:9px 0;${cell}"><b>${esc(p.name)}</b></td><td align="center" style="${cell}${c.logged === 0 ? "color:#be123c;font-weight:700;" : ""}">${c.logged}</td><td align="center" style="${cell}">${c.priced}</td><td align="center" style="${cell}">${c.accepted}</td><td align="center" style="${cell}">${c.open}</td></tr>`;
    }).join("");
    const attn = sec.attention.length
      ? `<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:14px 16px;margin-top:14px;font-size:13px;line-height:1.7;color:#7c2d12;"><b>Needs attention</b><br>${sec.attention.map((a) => `&bull; ${esc(a)}`).join("<br>")}</div>`
      : "";
    return `<tr><td style="padding:26px 28px 4px;">
<div style="font-size:20px;font-weight:800;color:#4338ca;border-left:4px solid #4f46e5;padding-left:12px;margin-bottom:14px;">${esc(sec.title)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="8" style="margin:-8px;"><tr>${kpi("Logged", S.logged, "#4f46e5")}${kpi("Accepted", S.accepted, "#1baf7a")}${kpi("Still open", S.open, "#eda100")}</tr></table>
<div style="font-size:13px;font-weight:800;color:#101828;margin:18px 0 8px;">By person</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;color:#344054;border-collapse:collapse;">
<tr style="color:#667085;font-size:11px;text-transform:uppercase;letter-spacing:.08em;"><td style="padding:6px 0;">Person</td><td align="center">Logged</td><td align="center">Priced</td><td align="center">Accepted</td><td align="center">Open</td></tr>${rows}</table>${attn}</td></tr>`;
  };
  const sectionsHtml = data.sections.map(block).join("");
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f3f4fb;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${T.logged} enquiries logged last week. Full report attached as PDF.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4fb;padding:32px 12px;font-family:${FONT};-webkit-font-smoothing:antialiased;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:20px;overflow:hidden;border:1px solid #e6e8f2;">
<tr><td style="background:#4f46e5;padding:22px 28px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="width:44px;height:44px;background:#fff;border-radius:12px;text-align:center;vertical-align:middle;"><img src="${base}/company-logo.png" width="34" height="34" alt="" style="display:inline-block;border:0;vertical-align:middle;"></td>
<td style="padding-left:14px;vertical-align:middle;"><div style="font-size:16px;font-weight:800;color:#fff;">${esc(COMPANY_NAME)}</div><div style="font-size:11px;font-weight:600;color:#c7d2fe;letter-spacing:.14em;text-transform:uppercase;margin-top:2px;">${esc(APP_NAME)}</div></td></tr></table></td></tr>
<tr><td style="padding:34px 28px 6px;"><span style="display:inline-block;padding:4px 12px;border-radius:999px;background:#eef0ff;color:#4338ca;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;">Weekly report</span>
<div style="font-size:30px;font-weight:800;color:#101828;letter-spacing:-.025em;margin:14px 0 6px;line-height:1.15;">Enquiries, ${esc(weekLabel(data))}</div>
<p style="margin:0;font-size:15px;line-height:1.65;color:#667085;">Good morning. The team logged <b style="color:#101828;">${T.logged} ${T.logged === 1 ? "enquiry" : "enquiries"}</b> last week, shown separately for each organization below. The full report with each person's enquiries is attached as a PDF.</p></td></tr>
${sectionsHtml}
<tr><td style="padding:22px 28px 30px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="background:#4f46e5;border-radius:12px;"><a href="${base}/overview" style="display:inline-block;padding:13px 22px;font-size:14px;font-weight:700;color:#fff;text-decoration:none;">Open the dashboard</a></td>
<td style="padding-left:12px;font-size:12px;color:#667085;">PDF attached: ${esc(fileName)}</td></tr></table></td></tr>
</table>
<p style="font-size:12px;color:#a1a1aa;max-width:600px;margin:18px 0 0;text-align:left;">Sent every Monday at 10:00 AM IST. This is an automated message from ${esc(COMPANY_NAME)}.</p>
</td></tr></table></body></html>`;
  const text = [
    subject, "",
    `${T.logged} enquiries logged, ${T.priced} priced, ${T.accepted} accepted, ${T.declined} declined, ${T.open} still open.`, "",
    ...data.sections.flatMap((sec) => [
      "", sec.title.toUpperCase(),
      ...sec.people.map((p) => { const c = countsOf(p.rows); return `${p.name}: ${c.logged} logged, ${c.priced} priced, ${c.accepted} accepted, ${c.open} open`; }),
      ...(sec.attention.length ? ["Needs attention:", ...sec.attention.map((a) => `- ${a}`)] : []),
    ]),
    "", `Full report attached: ${fileName}`,
  ].join("\n");
  return { subject, html, text };
}
