/**
 * POST /api/orders/[id]/submit-to-supervisor
 *
 * Division Head hands off the enquiry (with remarks) to the Supervisor.
 * Enforces the step order:
 *   - enquiry must be accepted / in progress
 *   - product must be classified (EXISTING or NEW)
 *   - if NEW, planning must be completed first
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { supervisorHandoffSchema } from "@/lib/validation";
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

  const body = await req.json().catch(() => ({}));
  const parsed = supervisorHandoffSchema.safeParse({ orderId, remarks: (body as { remarks?: unknown })?.remarks });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      currentDivisionId: true,
      productKind: true,
      planningCompletedAt: true,
      acceptedById: true,
      existingProductRef: true,
    },
  });
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const adminBypass = role === "SUPER_ADMIN" || role === "MANAGING_DIRECTOR";
  if (!adminBypass) {
    if (role !== "MANAGER") {
      return NextResponse.json({ error: "Only Division Head can submit to supervisor" }, { status: 403 });
    }
    const mapping = await prisma.divisionManager.findFirst({
      where: { userId, divisionId: order.currentDivisionId },
      select: { id: true },
    });
    if (!mapping) {
      return NextResponse.json({ error: "You do not manage this division" }, { status: 403 });
    }
  }

  if (order.status !== "IN_PROGRESS") {
    return NextResponse.json({ error: "Enquiry must be accepted before supervisor handoff" }, { status: 400 });
  }
  if (order.productKind !== "EXISTING" && order.productKind !== "NEW") {
    return NextResponse.json({ error: "Classify the product (Existing/New) before handoff" }, { status: 400 });
  }
  if (order.productKind === "NEW" && !order.planningCompletedAt) {
    return NextResponse.json({ error: "Complete planning before handing off a New Development enquiry" }, { status: 400 });
  }
  if (order.productKind === "EXISTING" && !order.existingProductRef?.trim()) {
    return NextResponse.json({ error: "Provide an existing product reference before handoff" }, { status: 400 });
  }

  const remarks = parsed.data.remarks.trim();

  // Persist in customFields so the handoff "inputs" show on the enquiry itself, not only in audit logs.
  const currentCustom =
    (await prisma.order.findUnique({ where: { id: orderId }, select: { customFields: true } }))?.customFields;
  const base =
    currentCustom && typeof currentCustom === "object"
      ? (currentCustom as Record<string, unknown>)
      : ({} as Record<string, unknown>);
  const nowIso = new Date().toISOString();
  await prisma.order.update({
    where: { id: orderId },
    data: {
      customFields: {
        ...base,
        supervisorHandoff: {
          remarks,
          submittedAt: nowIso,
          submittedById: userId,
          kind: order.productKind,
        },
      } as object,
    },
    select: { id: true },
  });

  await publish({
    type: "SupervisorHandoffSubmitted",
    orderId: order.id,
    orderNumber: order.orderNumber,
    divisionId: order.currentDivisionId,
    remarks,
    kind: order.productKind,
    timestamp: nowIso,
    userId,
  });

  return NextResponse.json({ ok: true });
}

