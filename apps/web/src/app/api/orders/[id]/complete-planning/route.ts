/**
 * POST /api/orders/[id]/complete-planning
 *
 * Division Head marks New Development planning as complete. From this moment:
 *   - `planningCompletedAt` is recorded
 *   - 48-hour SLA timer begins → `slaDeadline = now + 48h` (Sunday-aware)
 *
 * Requires the New Development popup fields (description, resources, R&D, timeline,
 * completion duration, why-needed) to already be saved on the order. Notes are optional.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { publish } from "@/lib/events";

const SLA_HOURS = 48;

function computeSlaDeadline(start: Date): Date {
  const d = new Date(start);
  d.setHours(d.getHours() + SLA_HOURS);
  if (d.getDay() === 0) d.setDate(d.getDate() + 1); // Sunday → push to Monday
  return d;
}

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
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
      planningCompletedAt: true,
      newDevDescription: true,
      newDevResources: true,
      newDevRandD: true,
      newDevTimeline: true,
      newDevCompletionDuration: true,
      newDevWhyNeeded: true,
    },
  });
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (order.productKind !== "NEW") {
    return NextResponse.json(
      { error: "Only New Development enquiries have a planning phase" },
      { status: 400 }
    );
  }
  if (order.planningCompletedAt) {
    return NextResponse.json({ error: "Planning is already complete" }, { status: 400 });
  }

  // Require all mandatory planning fields to be populated before we can lock and start SLA.
  const missing: string[] = [];
  if (!order.newDevDescription?.trim()) missing.push("newDevDescription");
  if (!order.newDevResources?.trim()) missing.push("newDevResources");
  if (!order.newDevRandD?.trim()) missing.push("newDevRandD");
  if (!order.newDevTimeline?.trim()) missing.push("newDevTimeline");
  if (!order.newDevCompletionDuration?.trim()) missing.push("newDevCompletionDuration");
  if (!order.newDevWhyNeeded?.trim()) missing.push("newDevWhyNeeded");
  if (missing.length) {
    return NextResponse.json(
      { error: "Submit the New Development planning popup before completing planning.", missing },
      { status: 400 }
    );
  }

  const adminBypass = role === "SUPER_ADMIN" || role === "MANAGING_DIRECTOR";
  if (!adminBypass) {
    if (role !== "MANAGER") {
      return NextResponse.json({ error: "Only Division Head can complete planning" }, { status: 403 });
    }
    const mapping = await prisma.divisionManager.findFirst({
      where: { userId, divisionId: order.currentDivisionId },
      select: { id: true },
    });
    if (!mapping) {
      return NextResponse.json({ error: "You do not manage this division" }, { status: 403 });
    }
  }

  const now = new Date();
  const updated = await prisma.order.update({
    where: { id: orderId },
    data: {
      planningCompletedAt: now,
      slaDeadline: computeSlaDeadline(now),
    },
    select: { id: true, planningCompletedAt: true, slaDeadline: true },
  });
  const orderNumberRow = await prisma.order.findUnique({ where: { id: orderId }, select: { orderNumber: true } });
  await publish({
    type: "PlanningCompleted",
    orderId,
    orderNumber: orderNumberRow?.orderNumber ?? `Enq-${orderId}`,
    divisionId: order.currentDivisionId,
    planningCompletedAt: updated.planningCompletedAt!.toISOString(),
    slaDeadline: updated.slaDeadline!.toISOString(),
    timestamp: new Date().toISOString(),
    userId,
  });
  return NextResponse.json({ ok: true, enquiry: updated });
}
