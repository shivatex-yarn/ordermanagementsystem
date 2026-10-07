/**
 * POST /api/sla/delay-reason — Division Head records why an enquiry ran past its
 * SLA. Required before the SLA gate will let go (see `SLAGate`).
 *
 * Body: { breachId: number, reason: string }
 *    or { breachIds: number[], reason: string }
 *
 * The plural form exists because delays come in batches — one machine down, one
 * supplier late — and making a head retype the same sentence fifteen times is
 * how you get fifteen useless sentences. Each breach still gets its own stored
 * reason and its own timeline entry; only the typing is shared.
 */
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { submitDelayReason } from "@/lib/sla-service";

/** Guard against a runaway request; a division will never legitimately send more. */
const MAX_PER_REQUEST = 50;

export async function POST(req: Request) {
  const auth = await withAuth();
  if (auth.response) return auth.response;
  const userId = Number(auth.payload.sub);
  if (!Number.isInteger(userId) || userId < 1) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    breachId?: unknown;
    breachIds?: unknown;
    reason?: unknown;
  };
  const reason = typeof body.reason === "string" ? body.reason : "";

  const rawIds = Array.isArray(body.breachIds)
    ? body.breachIds
    : body.breachId != null
      ? [body.breachId]
      : [];

  const breachIds = Array.from(
    new Set(rawIds.map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0))
  );

  if (breachIds.length === 0) {
    return NextResponse.json({ error: "Select at least one enquiry" }, { status: 400 });
  }
  if (breachIds.length > MAX_PER_REQUEST) {
    return NextResponse.json(
      { error: `Too many at once — ${MAX_PER_REQUEST} is the maximum` },
      { status: 400 }
    );
  }

  // Sequential: each submit runs a transaction, and the Neon pooler hands this
  // instance a single connection.
  const failures: { breachId: number; error: string }[] = [];
  let saved = 0;
  for (const breachId of breachIds) {
    const result = await submitDelayReason(breachId, userId, auth.payload.role, reason);
    if (result.ok) saved += 1;
    else failures.push({ breachId, error: result.reason });
  }

  // Nothing saved — the caller gets the first reason, which is almost always
  // "reason too short" and applies to all of them.
  if (saved === 0) {
    return NextResponse.json(
      { error: failures[0]?.error ?? "Could not save the reason", failures },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, saved, failures });
}
