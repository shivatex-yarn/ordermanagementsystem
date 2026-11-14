import { prisma } from "@/lib/db";
import { sendEmail, sendEmailsThrottled } from "@/lib/email";
import { notify } from "@/lib/activity";
import { renderInactivityEmail, type InactivityMail } from "@/lib/email-inactivity";

/** A Marketing person with no new enquiry for this many days triggers an alert. */
export const INACTIVITY_DAYS = 15;
/** While they stay inactive, remind again after this many days. */
export const REMINDER_EVERY_DAYS = 7;
const DAY = 864e5;

export type InactivityResult = { checked: number; inactive: number; alerted: number; skippedRecent: number; recipients: number; emailed: number; failed: number };

/** Finds inactive Marketing people and emails the Super admin(s) and MD(s). Safe to run daily. */
export async function runInactivityAlerts(now = new Date()): Promise<InactivityResult> {
  const people = await prisma.user.findMany({
    where: { role: "MARKETING", active: true, divisions: { some: {} } },
    select: { id: true, name: true, email: true, createdAt: true, organization: { select: { name: true } }, divisions: { select: { division: { select: { name: true } } } } },
  });
  const leaders = await prisma.user.findMany({ where: { role: { in: ["SUPER_ADMIN", "MANAGING_DIRECTOR"] }, active: true }, select: { id: true, email: true } });
  const result: InactivityResult = { checked: people.length, inactive: 0, alerted: 0, skippedRecent: 0, recipients: leaders.length, emailed: 0, failed: 0 };
  if (!people.length || !leaders.length) return result;

  const sends: Array<() => Promise<{ ok: boolean; error?: string }>> = [];
  for (const p of people) {
    const last = await prisma.order.findFirst({
      where: { createdById: p.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, orderNumber: true, companyName: true, customerName: true, enquiryDate: true, createdAt: true, division: { select: { name: true } } },
    });
    const since = last?.createdAt ?? p.createdAt;
    const days = Math.floor((now.getTime() - since.getTime()) / DAY);
    if (days < INACTIVITY_DAYS) continue;
    result.inactive++;

    // Already alerted for this stretch of inactivity? Only remind weekly.
    const prev = await prisma.auditLog.findFirst({
      where: { action: "INACTIVITY_ALERT_SENT", entityType: "User", entityId: p.id },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    if (prev && prev.createdAt > since && now.getTime() - prev.createdAt.getTime() < REMINDER_EVERY_DAYS * DAY) {
      result.skippedRecent++;
      continue;
    }

    const data: InactivityMail = {
      person: { name: p.name, email: p.email, organization: p.organization?.name ?? null, divisions: p.divisions.map((d) => d.division.name), joinedAt: p.createdAt },
      days, thresholdDays: INACTIVITY_DAYS,
      last: last ? { orderNumber: last.orderNumber, orderId: last.id, client: last.companyName || last.customerName, division: last.division.name, enquiryDate: last.enquiryDate, loggedAt: last.createdAt } : null,
    };
    const mail = renderInactivityEmail(data);
    const to = leaders.map((l) => l.email);
    // The "alert sent" record and the in-app notice are written only after the email really went out,
    // so a failed send (Resend down, key missing) is retried on the next daily run instead of being silenced for a week.
    sends.push(async () => {
      const r = await sendEmail({ to, subject: mail.subject, text: mail.text });
      if (!r.ok) {
        result.failed++;
        console.error(`[inactivity] email for ${p.name} not sent, will retry next run:`, r.error);
        return r;
      }
      result.emailed++;
      result.alerted++;
      await notify(leaders.map((l) => l.id), { type: "INACTIVITY", title: `Nil enquiries: ${p.name}${p.organization ? ` (${p.organization.name})` : ""}`, body: last ? `No enquiry for ${days} days. Last entry ${last.orderNumber} on ${last.createdAt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "Asia/Kolkata" })}.` : `No enquiry entered since joining (${days} days).`, link: "/team" });
      await prisma.auditLog.create({ data: { userName: "System", category: "TEAM", action: "INACTIVITY_ALERT_SENT", entityType: "User", entityId: p.id, entityLabel: p.name, detail: `${days} days without an enquiry` } });
      return r;
    });
  }
  await sendEmailsThrottled(sends);
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
