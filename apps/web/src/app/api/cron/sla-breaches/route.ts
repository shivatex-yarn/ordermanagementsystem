import { NextResponse } from "next/server";
import { runSlaBreachCheck } from "@/lib/sla-breach-job";

/**
 * Optional: call on a schedule (e.g. Vercel Cron) with header Authorization: Bearer <CRON_SECRET>.
 * If CRON_SECRET is unset, allows local/dev calls without auth (not for production).
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    const token = auth?.replace(/^Bearer\s+/i, "").trim();
    if (token !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  }

  try {
    const result = await runSlaBreachCheck();
    return NextResponse.json(result);
  } catch (err) {
    console.error("[cron/sla-breaches]", err);
    return NextResponse.json({ error: "SLA check failed" }, { status: 500 });
  }
}
