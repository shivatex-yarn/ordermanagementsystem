import { NextResponse } from "next/server";
import { runSlaBreachCheck } from "@/lib/sla-breach-job";

/**
 * Vercel Cron invokes scheduled jobs with HTTP GET (see vercel.json crons).
 * POST is supported for manual triggers and non-Vercel schedulers.
 *
 * Auth: Authorization: Bearer <CRON_SECRET> when CRON_SECRET is set in the project.
 * If CRON_SECRET is unset: allowed in development only (not production).
 */
function authorizeCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }
  const auth = req.headers.get("authorization");
  const token = auth?.replace(/^Bearer\s+/i, "").trim();
  return token === secret;
}

async function runSlaBreachHandler(): Promise<NextResponse> {
  try {
    const result = await runSlaBreachCheck();
    return NextResponse.json(result);
  } catch (err) {
    console.error("[cron/sla-breaches]", err);
    return NextResponse.json({ error: "SLA check failed" }, { status: 500 });
  }
}

async function handleCron(req: Request): Promise<NextResponse> {
  if (!authorizeCron(req)) {
    if (!process.env.CRON_SECRET && process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runSlaBreachHandler();
}

export async function GET(req: Request) {
  return handleCron(req);
}

export async function POST(req: Request) {
  return handleCron(req);
}
