import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { totalsOf, renderWeeklyEmail, renderWeeklyPdf, weeklyFileName, type Tone, type WeeklyData, type WeeklyPerson, type WeeklyRow, type WeeklySection } from "@/lib/weekly-report-render";

/** Always copied on the report, in addition to every active Super admin and Managing director. Override with WEEKLY_REPORT_EXTRA_EMAILS (comma separated). */
const DEFAULT_EXTRA = "vishnuprasad@shivatex.in";
const extraRecipients = () => (process.env.WEEKLY_REPORT_EXTRA_EMAILS ?? DEFAULT_EXTRA).split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

const DAY = 864e5;
const IST_OFFSET = 330 * 60_000; // India has no daylight saving
/** Monday 10:00 AM IST = 04:30 UTC. */
const DUE_UTC_MINUTES = 4 * 60 + 30;

/** Previous Monday 00:00 IST up to (not including) this Monday 00:00 IST, for a given moment. */
export function weekWindow(now: Date) {
  const shifted = new Date(now.getTime() + IST_OFFSET);
  const sinceMonday = (shifted.getUTCDay() + 6) % 7;
  const thisMonday = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate() - sinceMonday) - IST_OFFSET;
  const start = new Date(thisMonday - 7 * DAY);
  const end = new Date(thisMonday);
  return { start, end, endDay: new Date(end.getTime() - DAY) };
}

function describe(o: { status: string; clientResponse: string | null }): { label: string; tone: Tone } {
  if (o.status === "CANCELLED") return { label: "Cancelled", tone: "grey" };
  if (o.status === "CLOSED") return o.clientResponse === "ACCEPTED" ? { label: "Closed - accepted", tone: "good" } : { label: "Closed - declined", tone: "grey" };
  if (o.status === "PRICED") return o.clientResponse === "NEGOTIATING" ? { label: "Negotiating", tone: "warn" } : { label: "Waiting for client", tone: "wait" };
  return { label: "Needs pricing", tone: "warn" };
}

type OrderRow = Awaited<ReturnType<typeof loadOrders>>[number];
const loadOrders = (start: Date, end: Date) =>
  prisma.order.findMany({
    where: { createdAt: { gte: start, lt: end } },
    orderBy: [{ createdAt: "asc" }],
    select: {
      id: true, orderNumber: true, enquiryDate: true, customerName: true, companyName: true, status: true, isSample: true, sampleSentAt: true,
      pricePerUnit: true, priceUnit: true, pricedAt: true, clientResponse: true, clientFeedback: true,
      division: { select: { name: true } }, createdBy: { select: { id: true, name: true, organizationId: true, active: true } },
    },
  });
type Marketer = { id: number; name: string; organizationId: number | null; divisions: { division: { name: string } }[] };

/** One organization's slice of the report: its own people, its own division counts, its own attention list. */
async function buildSection(title: string, orders: OrderRow[], marketers: Marketer[], start: Date, now: Date): Promise<WeeklySection> {
  const byUser = new Map<number, WeeklyPerson>();
  const person = (id: number, name: string, divs: string[]) => {
    let p = byUser.get(id);
    if (!p) byUser.set(id, (p = { name, divisions: divs, rows: [], lastEntry: null }));
    return p;
  };
  marketers.forEach((m) => person(m.id, m.name, m.divisions.map((d) => d.division.name).sort()));

  for (const o of orders) {
    const { label, tone } = describe(o);
    const price = o.pricePerUnit ? `Rs ${Number(o.pricePerUnit.toString()).toLocaleString("en-IN", { minimumFractionDigits: 2 })} / ${o.priceUnit ?? "unit"}` : "-";
    const response = o.clientResponse
      ? (o.clientResponse === "ACCEPTED" ? "Accepted" : o.clientResponse === "DECLINED" ? "Declined" : "Negotiating") + (o.clientFeedback ? `: ${o.clientFeedback.slice(0, 40)}${o.clientFeedback.length > 40 ? "..." : ""}` : "")
      : "-";
    const row: WeeklyRow = {
      orderNumber: o.orderNumber, enquiryDate: o.enquiryDate, client: o.companyName || o.customerName, division: o.division.name,
      statusLabel: label, tone, price, response,
      priced: o.pricedAt !== null, accepted: o.status === "CLOSED" && o.clientResponse === "ACCEPTED", declined: o.status === "CLOSED" && o.clientResponse === "DECLINED",
      open: o.status === "PLACED" || o.status === "PRICED", sampleSent: o.isSample && o.sampleSentAt !== null,
    };
    person(o.createdBy.id, o.createdBy.name, []).rows.push(row);
  }

  // People with nothing this week: when did they last log an enquiry?
  for (const [id, p] of byUser) {
    if (p.rows.length) continue;
    const last = await prisma.order.findFirst({ where: { createdById: id, createdAt: { lt: start } }, orderBy: { createdAt: "desc" }, select: { orderNumber: true, createdAt: true } });
    p.lastEntry = last ? { orderNumber: last.orderNumber, at: last.createdAt } : null;
  }

  const people = [...byUser.values()].sort((a, b) => b.rows.length - a.rows.length || a.name.localeCompare(b.name));
  const counts = new Map<string, number>();
  orders.forEach((o) => counts.set(o.division.name, (counts.get(o.division.name) ?? 0) + 1));
  // Show this organization's divisions even when they had no enquiries.
  people.forEach((p) => p.divisions.forEach((d) => { if (!counts.has(d)) counts.set(d, 0); }));
  const byDivision = [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const attention: string[] = [];
  for (const p of people) {
    if (p.rows.length) continue;
    const dShort = p.lastEntry ? p.lastEntry.at.toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "Asia/Kolkata" }) : "";
    const days = p.lastEntry ? Math.floor((now.getTime() - p.lastEntry.at.getTime()) / DAY) : 0;
    attention.push(p.lastEntry ? `${p.name} logged no enquiry this week (last entry ${dShort}, ${days} days ago).` : `${p.name} has never entered an enquiry.`);
  }
  for (const o of orders) if (o.status === "PLACED") attention.push(`${o.orderNumber} (${o.companyName || o.customerName}) is still waiting for a price.`);
  for (const o of orders) if (o.status === "PRICED" && o.clientResponse === "NEGOTIATING") attention.push(`${o.orderNumber} is under negotiation.`);
  const shown = attention.slice(0, 6);
  if (attention.length > shown.length) shown.push(`...and ${attention.length - shown.length} more.`);

  return { title, people, byDivision, attention: shown };
}

/** Builds the report as one separate section per organization ("Shivatex Yarn enquiries", "Abirami Ecoplast enquiries", ...). */
export async function gatherWeeklyData(now = new Date()): Promise<WeeklyData> {
  const { start, end, endDay } = weekWindow(now);
  const [orders, marketers, organizations] = await Promise.all([
    // Only active people appear in the report: enquiries logged by a deactivated person are left out.
    loadOrders(start, end).then((rows) => rows.filter((o) => o.createdBy.active)),
    prisma.user.findMany({
      where: { role: "MARKETING", active: true, divisions: { some: {} } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, organizationId: true, divisions: { select: { division: { select: { name: true } } } } },
    }),
    prisma.organization.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const sections: WeeklySection[] = [];
  for (const org of organizations) {
    const o = orders.filter((x) => x.createdBy.organizationId === org.id);
    const m = marketers.filter((x) => x.organizationId === org.id);
    if (o.length || m.length) sections.push(await buildSection(`${org.name} enquiries`, o, m, start, now));
  }
  const knownIds = new Set(organizations.map((o) => o.id));
  const loose = orders.filter((x) => !x.createdBy.organizationId || !knownIds.has(x.createdBy.organizationId));
  const looseMarketers = marketers.filter((x) => !x.organizationId || !knownIds.has(x.organizationId));
  if (loose.length || looseMarketers.length) {
    sections.push(await buildSection(sections.length ? "Other enquiries" : "All enquiries", loose, looseMarketers, start, now));
  }
  if (!sections.length) sections.push(await buildSection("All enquiries", [], [], start, now));

  return { start, endDay, generatedAt: now, sections };
}

export type WeeklyResult = { status: "sent" | "skipped" | "failed"; reason?: string; recipients?: number; enquiries?: number };

/** Builds this week's PDF and emails it. Does not check the clock or the "already sent" record. */
export async function sendWeeklyReport(now = new Date()): Promise<WeeklyResult> {
  const leaders = await prisma.user.findMany({ where: { role: { in: ["SUPER_ADMIN", "MANAGING_DIRECTOR"] }, active: true }, select: { email: true } });
  const to = [...new Set([...leaders.map((l) => l.email.toLowerCase()), ...extraRecipients()])];
  if (!to.length) return { status: "skipped", reason: "no recipients" };
  const data = await gatherWeeklyData(now);
  const fileName = weeklyFileName(data);
  const pdf = await renderWeeklyPdf(data);
  const mail = renderWeeklyEmail(data, fileName);
  const r = await sendEmail({ to, subject: mail.subject, html: mail.html, text: mail.text, attachments: [{ filename: fileName, content: pdf }] });
  if (!r.ok) return { status: "failed", reason: r.error, recipients: to.length };
  const enquiries = totalsOf(data).logged;
  await prisma.auditLog.create({ data: { userName: "System", category: "TEAM", action: "WEEKLY_REPORT_SENT", detail: `${fileName} to ${to.length} recipient(s), ${enquiries} enquiries` } }).catch(() => {});
  return { status: "sent", recipients: to.length, enquiries };
}

let lastWeekHandled = "";

/**
 * Runs the weekly report once, on Monday from 10:00 AM IST. Called by Vercel Cron and, as a backup, by the first
 * signed-in request after that time. A claim row in the audit log keeps two requests or servers from both sending.
 * A failed send releases the claim so the next request retries. Never throws.
 */
export async function runWeeklyReportIfDue(now = new Date()): Promise<WeeklyResult> {
  try {
    const shifted = new Date(now.getTime() + IST_OFFSET);
    if (shifted.getUTCDay() !== 1) return { status: "skipped", reason: "not Monday" };
    const due = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, DUE_UTC_MINUTES));
    if (now < due) return { status: "skipped", reason: "before 10:00 IST" };
    const dayKey = due.toISOString().slice(0, 10);
    if (lastWeekHandled === dayKey) return { status: "skipped", reason: "already handled" };

    const done = await prisma.auditLog.findFirst({ where: { action: { in: ["WEEKLY_REPORT_SENT", "WEEKLY_REPORT_CLAIM"] }, createdAt: { gte: due } }, select: { id: true, action: true } });
    if (done?.action === "WEEKLY_REPORT_SENT") { lastWeekHandled = dayKey; return { status: "skipped", reason: "already sent" }; }
    if (done) return { status: "skipped", reason: "another run in progress" };

    const claim = await prisma.auditLog.create({ data: { userName: "System", category: "TEAM", action: "WEEKLY_REPORT_CLAIM", detail: "Monday 10:00 IST weekly report" }, select: { id: true } });
    const first = await prisma.auditLog.findFirst({ where: { action: "WEEKLY_REPORT_CLAIM", createdAt: { gte: due } }, orderBy: { id: "asc" }, select: { id: true } });
    if (first && first.id !== claim.id) return { status: "skipped", reason: "another run claimed it" };

    const result = await sendWeeklyReport(now);
    if (result.status === "sent") lastWeekHandled = dayKey;
    else {
      console.error("[weekly-report] not sent, will retry:", result.reason);
      await prisma.auditLog.delete({ where: { id: claim.id } }).catch(() => {});
    }
    return result;
  } catch (err) {
    console.error("[weekly-report] failed:", err);
    return { status: "failed", reason: err instanceof Error ? err.message : String(err) };
  }
}
