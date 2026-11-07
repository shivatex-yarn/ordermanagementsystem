import { NextResponse } from "next/server";
import { runInactivityAlerts } from "@/lib/inactivity";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Daily check, triggered by Vercel Cron (see vercel.json). Vercel sends `Authorization: Bearer <CRON_SECRET>`.
 * Without CRON_SECRET set the endpoint refuses every call, so it is never publicly runnable.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, ...(await runInactivityAlerts()) });
  } catch (err) {
    console.error("[cron] marketing-inactivity failed:", err);
    return NextResponse.json({ error: "Check failed" }, { status: 500 });
  }
}
