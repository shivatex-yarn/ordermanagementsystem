/**
 * POST /api/orders/[id]/new-development-plan
 *
 * Division Head submits the mandatory New Development popup fields. SLA stays paused
 * until /complete-planning is called separately.
 *
 * Body: { newDevDescription, newDevResources, newDevRandD, newDevTimeline,
 *         newDevNotes?, newDevCompletionDuration, newDevWhyNeeded }
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { newDevelopmentPlanSchema } from "@/lib/validation";
import { publish } from "@/lib/events";

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
    select: {
      id: true,
      currentDivisionId: true,
      productKind: true,
      planningStartedAt: true,
      planningCompletedAt: true,
    },
  });
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (order.productKind !== "NEW") {
    return NextResponse.json(
      { error: "Enquiry must be classified as New Development first" },
      { status: 400 }
    );
  }
  if (order.planningCompletedAt) {
    return NextResponse.json({ error: "Planning is already complete" }, { status: 400 });
  }

  const adminBypass = role === "SUPER_ADMIN" || role === "MANAGING_DIRECTOR";
  if (!adminBypass) {
    if (role !== "MANAGER") {
      return NextResponse.json({ error: "Only Division Head can submit planning" }, { status: 403 });
    }
    const mapping = await prisma.divisionManager.findFirst({
      where: { userId, divisionId: order.currentDivisionId },
      select: { id: true },
    });
    if (!mapping) {
      return NextResponse.json({ error: "You do not manage this division" }, { status: 403 });
    }
  }

  const body = await req.json().catch(() => ({}));
  const parsed = newDevelopmentPlanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: {
      newDevDescription:        parsed.data.newDevDescription.trim(),
      newDevResources:          parsed.data.newDevResources.trim(),
      newDevRandD:              parsed.data.newDevRandD.trim(),
      newDevTimeline:           parsed.data.newDevTimeline.trim(),
      newDevNotes:              parsed.data.newDevNotes.trim() || null,
      newDevCompletionDuration: parsed.data.newDevCompletionDuration.trim(),
      newDevWhyNeeded:          parsed.data.newDevWhyNeeded.trim(),
      // If planningStartedAt was never set (e.g. classify-product wasn't called explicitly),
      // backfill it so duration math still works.
      planningStartedAt: order.planningStartedAt ?? new Date(),
    },
    select: {
      id: true,
      planningStartedAt: true,
      newDevDescription: true,
      newDevTimeline: true,
      newDevCompletionDuration: true,
    },
  });
  const orderNumberRow = await prisma.order.findUnique({ where: { id: orderId }, select: { orderNumber: true } });
  await publish({
    type: "NewDevelopmentPlanSubmitted",
    orderId,
    orderNumber: orderNumberRow?.orderNumber ?? `Enq-${orderId}`,
    divisionId: order.currentDivisionId,
    planningStartedAt: (updated.planningStartedAt ?? new Date()).toISOString(),
    timestamp: new Date().toISOString(),
    userId,
  });
  return NextResponse.json({ ok: true, enquiry: updated });
}
