/**
 * POST /api/sla/delay-reason — Division Head submits a free-form delay reason for an
 * SLA-breached enquiry. Required before they can access other modules (see SLA gate).
 *
 * Body: { breachId: number, reason: string }
 */
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { submitDelayReason } from "@/lib/sla-service";

export async function POST(req: Request) {
  const auth = await withAuth();
  if (auth.response) return auth.response;
  const userId = Number(auth.payload.sub);
  if (!Number.isInteger(userId) || userId < 1) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { breachId?: unknown; reason?: unknown };
  const breachId = Number(body.breachId);
  const reason = typeof body.reason === "string" ? body.reason : "";
  if (!Number.isInteger(breachId) || breachId < 1) {
    return NextResponse.json({ error: "Invalid breachId" }, { status: 400 });
  }
  const result = await submitDelayReason(breachId, userId, auth.payload.role, reason);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
