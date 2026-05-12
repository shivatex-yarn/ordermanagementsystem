/**
 * POST /api/orders/[id]/sample-received
 *
 * Salesperson records the sample-received date once the lab/factory hands off the sample.
 * Body: { receivedAt: string (ISO) }
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { appendTimeline } from "@/lib/timeline";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await withAuth();
  if (auth.response) return auth.response;
  const { id } = await ctx.params;
  const orderId = Number(id);
  if (!Number.isInteger(orderId) || orderId < 1) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const userId = Number(auth.payload.sub);

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, orderNumber: true, createdById: true, status: true, sampleApprovedAt: true },
  });
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const role = auth.payload.role;
  const adminBypass = role === "SUPER_ADMIN" || role === "MANAGING_DIRECTOR";
  if (!adminBypass && order.createdById !== userId) {
    return NextResponse.json({ error: "Only the creator can record sample receipt" }, { status: 403 });
  }
  if (!order.sampleApprovedAt) {
    return NextResponse.json({ error: "Sample has not been approved yet" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as { receivedAt?: unknown };
  const parsed = body.receivedAt ? new Date(String(body.receivedAt)) : new Date();
  const receivedAt = Number.isNaN(parsed.getTime()) ? new Date() : parsed;

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: { sampleReceivedAt: receivedAt },
    select: { id: true, orderNumber: true, sampleReceivedAt: true },
  });

  await appendTimeline({
    orderId,
    type: "SAMPLE_RECEIVED",
    title: "Sample received by salesperson",
    detail: `Received on ${receivedAt.toISOString().slice(0, 10)}`,
    actorId: userId,
    metadata: { receivedAt: receivedAt.toISOString() },
  });

  return NextResponse.json({ ok: true, enquiry: updated });
}
