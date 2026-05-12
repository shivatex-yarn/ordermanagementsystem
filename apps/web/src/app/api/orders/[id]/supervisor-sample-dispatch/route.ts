/**
 * POST /api/orders/[id]/supervisor-sample-dispatch
 *
 * Division Supervisor saves sample fulfilment details and records dispatch in one step.
 * Persists to Order columns so Division Head and the salesperson see the same fields.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { supervisorSampleDispatchSchema } from "@/lib/validation";
import { submitSupervisorSampleDispatch } from "@/lib/order-engine";

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

  if (role !== "SUPERVISOR" && role !== "SUPER_ADMIN" && role !== "MANAGING_DIRECTOR") {
    return NextResponse.json({ error: "Only supervisors can submit sample dispatch" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = supervisorSampleDispatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, currentDivisionId: true, sampleRequested: true, status: true, sampleShippedAt: true },
  });
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (role === "SUPERVISOR") {
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: { divisionId: true },
    });
    if (u?.divisionId !== order.currentDivisionId) {
      return NextResponse.json({ error: "You can only submit for enquiries in your division" }, { status: 403 });
    }
  }

  if (!order.sampleRequested) {
    return NextResponse.json({ error: "This enquiry does not request a sample" }, { status: 400 });
  }
  if (order.sampleShippedAt) {
    return NextResponse.json({ error: "Sample dispatch is already recorded" }, { status: 400 });
  }

  const d = parsed.data;
  const updated = await submitSupervisorSampleDispatch(orderId, userId, {
    sampleDetails: d.sampleDetails,
    sampleQuantity: d.sampleQuantity,
    sampleWeight: d.sampleWeight,
    sentByCourier: d.sentByCourier,
    courierName: d.courierName,
    trackingId: d.trackingId,
  });

  if (!updated) {
    return NextResponse.json(
      { error: "Could not save sample dispatch (check enquiry status and courier fields)" },
      { status: 400 }
    );
  }

  return NextResponse.json(updated);
}
