import { NextResponse } from "next/server";
import { runWeeklyReportIfDue } from "@/lib/weekly-report";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Monday 10:00 AM IST weekly report, triggered by Vercel Cron (see vercel.json).
 * Vercel sends `Authorization: Bearer <CRON_SECRET>`; without CRON_SECRET the endpoint refuses every call.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runWeeklyReportIfDue();
  return NextResponse.json({ ok: result.status !== "failed", ...result }, { status: result.status === "failed" ? 500 : 200 });
}
