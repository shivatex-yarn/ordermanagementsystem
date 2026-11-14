import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { COMPANY_NAME } from "@/lib/branding";
import { notify } from "@/lib/activity";
import { inactivityFileName, renderInactivityPdf, type InactiveRow, type InactiveSection, type InactivityReport } from "@/lib/inactivity-pdf";

/** A Marketing person with no new enquiry for this many days triggers an alert. */
export const INACTIVITY_DAYS = 15;
/** While they stay inactive, remind again after this many days. */
export const REMINDER_EVERY_DAYS = 7;
const DAY = 864e5;

export type InactivityResult = { checked: number; inactive: number; alerted: number; skippedRecent: number; recipients: number; emailed: number; failed: number };

/**
 * Finds Marketing people with no enquiry for 15+ days and emails the Super admin(s) and MD(s) ONE email with a PDF,
 * grouped by organization. Safe to run daily: a person already reported is only repeated weekly.
 */
export async function runInactivityAlerts(now = new Date()): Promise<InactivityResult> {
  const people = await prisma.user.findMany({
    where: { role: "MARKETING", active: true, divisions: { some: {} } },
    select: { id: true, name: true, email: true, createdAt: true, organization: { select: { name: true } }, divisions: { select: { division: { select: { name: true } } } } },
  });
  const leaders = await prisma.user.findMany({ where: { role: { in: ["SUPER_ADMIN", "MANAGING_DIRECTOR"] }, active: true }, select: { id: true, email: true } });
  const result: InactivityResult = { checked: people.length, inactive: 0, alerted: 0, skippedRecent: 0, recipients: leaders.length, emailed: 0, failed: 0 };
  if (!people.length || !leaders.length) return result;

  const due: { id: number; org: string; row: InactiveRow }[] = [];
  for (const p of people) {
    const last = await prisma.order.findFirst({
      where: { createdById: p.id },
      orderBy: { createdAt: "desc" },
      select: { orderNumber: true, companyName: true, customerName: true, createdAt: true },
    });
    const since = last?.createdAt ?? p.createdAt;
    const days = Math.floor((now.getTime() - since.getTime()) / DAY);
    if (days < INACTIVITY_DAYS) continue;
    result.inactive++;

    // Already reported for this stretch of inactivity? Only repeat weekly.
    const prev = await prisma.auditLog.findFirst({
      where: { action: "INACTIVITY_ALERT_SENT", entityType: "User", entityId: p.id },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    if (prev && prev.createdAt > since && now.getTime() - prev.createdAt.getTime() < REMINDER_EVERY_DAYS * DAY) {
      result.skippedRecent++;
      continue;
    }
    due.push({
      id: p.id,
      org: p.organization?.name ?? "",
      row: {
        name: p.name, email: p.email, divisions: p.divisions.map((d) => d.division.name).sort(), days, joinedAt: p.createdAt,
        last: last ? { orderNumber: last.orderNumber, client: last.companyName || last.customerName, at: last.createdAt } : null,
      },
    });
  }
  if (!due.length) return result;

  // One titled section per organization; people without one go last under "Other".
  const orgNames = [...new Set(due.map((d) => d.org).filter(Boolean))].sort();
  const sections: InactiveSection[] = orgNames.map((o) => ({ title: `${o} enquiries`, rows: due.filter((d) => d.org === o).map((d) => d.row) }));
  const loose = due.filter((d) => !d.org);
  if (loose.length) sections.push({ title: orgNames.length ? "Other enquiries" : "All enquiries", rows: loose.map((d) => d.row) });
  sections.forEach((s) => s.rows.sort((a, b) => b.days - a.days));
  const report: InactivityReport = { thresholdDays: INACTIVITY_DAYS, generatedAt: now, sections };

  const fileName = inactivityFileName(report);
  const n = due.length;
  const subject = `Nil enquiries for ${INACTIVITY_DAYS}+ days: ${n} ${n === 1 ? "person" : "people"}`;
  const text = [
    `${n} Marketing ${n === 1 ? "person has" : "people have"} not entered an enquiry in ${INACTIVITY_DAYS} days or more.`,
    "", ...sections.map((s) => `${s.title}: ${s.rows.map((r) => `${r.name} (${r.days} days)`).join(", ")}`),
    "", `Full report attached: ${fileName}`,
    "", `${COMPANY_NAME} - automated message`,
  ].join("\n");

  const r = await sendEmail({ to: leaders.map((l) => l.email), subject, text, attachments: [{ filename: fileName, content: await renderInactivityPdf(report) }] });
  // The "alert sent" records and in-app notices are written only after the email really went out,
  // so a failed send (Resend down, key missing) is retried instead of being silenced for a week.
  if (!r.ok) {
    result.failed++;
    console.error("[inactivity] report not sent, will retry:", r.error);
    return result;
  }
  result.emailed = 1;
  result.alerted = n;
  await notify(leaders.map((l) => l.id), { type: "INACTIVITY", title: `Nil enquiries: ${n} ${n === 1 ? "person" : "people"}`, body: due.map((d) => `${d.row.name} (${d.row.days} days)`).slice(0, 5).join(", ") + (n > 5 ? `, and ${n - 5} more.` : "."), link: "/team" });
  await prisma.auditLog.createMany({ data: due.map((d) => ({ userName: "System", category: "TEAM", action: "INACTIVITY_ALERT_SENT", entityType: "User", entityId: d.id, entityLabel: d.row.name, detail: `${d.row.days} days without an enquiry` })) });
  return result;
}

/** Daily send time: 10:30 AM IST = 05:00 UTC (India has no daylight saving). */
const DUE_UTC_HOUR = 5;
let lastDayHandled = "";

/**
 * Backend fallback that needs no external scheduler: any signed-in request after 10:30 IST triggers today's check,
 * once. A claim row in the audit log makes sure only one request (and one server instance) runs it.
 * Never throws.
 */
export async function runInactivityCheckIfDue(now = new Date()): Promise<void> {
  try {
    const dayKey = now.toISOString().slice(0, 10);
    if (lastDayHandled === dayKey) return;
    const due = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), DUE_UTC_HOUR, 0, 0));
    if (now < due) return;

    const where = { action: "INACTIVITY_CHECK_RUN", createdAt: { gte: due } };
    if (await prisma.auditLog.findFirst({ where, select: { id: true } })) { lastDayHandled = dayKey; return; }
    const claim = await prisma.auditLog.create({ data: { userName: "System", category: "TEAM", action: "INACTIVITY_CHECK_RUN", detail: "Daily 10:30 IST inactivity check" }, select: { id: true } });
    lastDayHandled = dayKey;
    const first = await prisma.auditLog.findFirst({ where, orderBy: { id: "asc" }, select: { id: true } });
    if (first && first.id !== claim.id) return; // another request claimed it first
    await runInactivityAlerts(now);
  } catch (err) {
    console.error("[inactivity] daily check failed:", err);
  }
}
