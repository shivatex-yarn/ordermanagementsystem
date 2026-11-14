/**
 * Backend scheduler (Node runtime only). Starts once when the server boots and checks every few minutes whether a job is due:
 *   - daily 10:30 AM IST: inactivity alert (15 days without an enquiry) to Super admin and MD
 *   - Monday 10:00 AM IST: weekly enquiry report PDF to Super admin, MD and the extra recipient
 * Each job records a claim in the audit log, so it runs once even if Vercel Cron, a signed-in request and this timer all fire.
 * On serverless hosting the process may sleep; Vercel Cron (vercel.json) and the first signed-in request then cover it.
 */
import { runInactivityCheckIfDue } from "@/lib/inactivity";
import { runWeeklyReportIfDue } from "@/lib/weekly-report";

const g = globalThis as { __schedulerStarted?: boolean };
if (!g.__schedulerStarted) {
  g.__schedulerStarted = true;
  const tick = async () => {
    await runInactivityCheckIfDue().catch((e) => console.error("[scheduler] inactivity:", e));
    await runWeeklyReportIfDue().catch((e) => console.error("[scheduler] weekly report:", e));
  };
  const timer = setInterval(() => void tick(), 5 * 60_000);
  timer.unref?.();
  setTimeout(() => void tick(), 30_000).unref?.();
  console.log("[scheduler] started: inactivity daily 10:30 IST, weekly report Mondays 10:00 IST");
}
