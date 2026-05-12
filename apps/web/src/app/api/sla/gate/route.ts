/**
 * GET /api/sla/gate — returns the list of SLA breaches for which the current Division Head
 * still needs to submit a delay reason. The dashboard layout calls this on mount; if the
 * list is non-empty, the SLA gate overlay locks the rest of the app.
 *
 * Visible to division heads (DIVISION_HEAD/MANAGER); returns `{ pending: [] }` for everyone
 * else so the gate never fires unintentionally.
 */
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { pendingDelayReasonBreaches } from "@/lib/sla-service";

export async function GET() {
  const auth = await withAuth();
  if (auth.response) return auth.response;
  const userId = Number(auth.payload.sub);
  if (!Number.isInteger(userId) || userId < 1) {
    return NextResponse.json({ pending: [] });
  }
  try {
    const pending = await pendingDelayReasonBreaches(userId, auth.payload.role, auth.payload.divisionId);
    return NextResponse.json({
      pending: pending.map((b) => ({
        breachId: b.id,
        breachedAt: b.breachedAt.toISOString(),
        order: {
          id: b.order.id,
          orderNumber: b.order.orderNumber,
          companyName: b.order.companyName,
          status: b.order.status,
          priority: b.order.priority,
          createdAt: b.order.createdAt.toISOString(),
        },
        division: b.division,
        headRejectionMessage: b.headRejectionMessage,
        headRejectedAt: b.headRejectedAt ? b.headRejectedAt.toISOString() : null,
      })),
    });
  } catch (err) {
    console.error("[GET /api/sla/gate]", err);
    return NextResponse.json({ pending: [], error: "Failed to load gate state" }, { status: 200 });
  }
}
