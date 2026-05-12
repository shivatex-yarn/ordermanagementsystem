/**
 * POST /api/orders/[id]/priority
 * Division Head / MD / Admin can adjust an enquiry's priority. Drives MD dashboard highlights.
 *
 * Body: { priority: 'LOW'|'NORMAL'|'HIGH'|'CRITICAL' }
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { appendTimeline } from "@/lib/timeline";
import { isDivisionHead, isExecutive } from "@/lib/roles";

const ALLOWED = new Set(["LOW", "NORMAL", "HIGH", "CRITICAL"]);

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await withAuth();
  if (auth.response) return auth.response;
  const { id } = await ctx.params;
  const orderId = Number(id);
  if (!Number.isInteger(orderId) || orderId < 1) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const userId = Number(auth.payload.sub);
  const role = auth.payload.role;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, currentDivisionId: true, priority: true },
  });
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!isExecutive(role)) {
    if (!isDivisionHead(role)) {
      return NextResponse.json({ error: "Only Division Head or MD can change priority" }, { status: 403 });
    }
    const mapping = await prisma.divisionManager.findFirst({
      where: { userId, divisionId: order.currentDivisionId },
      select: { id: true },
    });
    if (!mapping) return NextResponse.json({ error: "You do not manage this division" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { priority?: unknown };
  const priority = typeof body.priority === "string" ? body.priority.toUpperCase() : "";
  if (!ALLOWED.has(priority)) {
    return NextResponse.json({ error: "Invalid priority" }, { status: 400 });
  }

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: { priority: priority as "LOW" | "NORMAL" | "HIGH" | "CRITICAL" },
    select: { id: true, orderNumber: true, priority: true },
  });

  await appendTimeline({
    orderId,
    type: "PRIORITY_CHANGED",
    title: `Priority changed: ${order.priority} → ${priority}`,
    actorId: userId,
    metadata: { from: order.priority, to: priority },
  });

  return NextResponse.json({ ok: true, enquiry: updated });
}
