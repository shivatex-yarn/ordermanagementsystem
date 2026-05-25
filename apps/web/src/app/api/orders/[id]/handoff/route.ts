import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { submitEnquiryHandoff } from "@/lib/order-engine";
import { userCanViewOrder } from "@/lib/order-view-permission";
import { enquiryHandoffSchema } from "@/lib/validation";
import { withAuth, withRole } from "@/lib/with-auth";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // SUPERVISOR / ASM (production staff) are allowed so they can update their own
  // assignment's development details after being assigned by the head.
  const auth = await withRole([
    "MANAGER", "DIVISION_HEAD", "SUPER_ADMIN", "MANAGING_DIRECTOR",
    "SUPERVISOR", "ASM",
  ]);
  if (auth.response) return auth.response;
  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid enquiry id" }, { status: 400 });
  }
  const rawBody = await req.json().catch(() => ({}));
  let body = rawBody as Record<string, unknown>;

  /** Allow omitting `newDevPlan` when full planning is already stored. */
  if (body?.developmentKind === "new" && body?.newDevPlan == null) {
    const existing = await prisma.order.findUnique({
      where: { id },
      select: { enquiryHandoff: true, newDevPlan: true },
    });
    const h = existing?.enquiryHandoff as Record<string, unknown> | null | undefined;
    const fromHandoff = h?.planning;
    if (existing?.newDevPlan && typeof existing.newDevPlan === "object") {
      body = { ...body, newDevPlan: existing.newDevPlan };
    } else if (fromHandoff && typeof fromHandoff === "object") {
      body = { ...body, newDevPlan: fromHandoff };
    }
  }

  const parsed = enquiryHandoffSchema.safeParse({
    orderId: id,
    supervisorId: body?.supervisorId,
    developmentKind: body?.developmentKind,
    newDevelopmentDetails: body?.newDevelopmentDetails,
    existingProductDetails: body?.existingProductDetails,
    newDevPlan: body?.newDevPlan,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const orderRow = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      createdById: true,
      currentDivisionId: true,
      previousDivisionId: true,
      assignedSupervisorId: true,
    },
  });
  if (!orderRow) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const canView = await userCanViewOrder(auth.payload, orderRow);
  if (!canView) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const userId = Number(auth.payload.sub);
  const isSupervisorRole = auth.payload.role === "SUPERVISOR" || auth.payload.role === "ASM";

  // Production staff (SUPERVISOR / ASM) may only update details for an order where
  // they are the assigned production person, and they cannot reassign themselves to
  // a different person — the supervisorId must remain their own.
  if (isSupervisorRole) {
    if (orderRow.assignedSupervisorId !== userId) {
      return NextResponse.json(
        { error: "You can only update development details for enquiries assigned to you." },
        { status: 403 }
      );
    }
    if (parsed.data.supervisorId !== userId) {
      return NextResponse.json(
        { error: "Production staff cannot reassign the enquiry to a different person." },
        { status: 403 }
      );
    }
  }

  const bypassHead = ["SUPER_ADMIN", "MANAGING_DIRECTOR", "MANAGER", "DIVISION_HEAD", "SUPERVISOR", "ASM"].includes(
    auth.payload.role
  );
  let order;
  try {
    order = await submitEnquiryHandoff(
      parsed.data.orderId,
      userId,
      {
        supervisorId: parsed.data.supervisorId,
        developmentKind: parsed.data.developmentKind,
        newDevelopmentDetails: parsed.data.newDevelopmentDetails,
        existingProductDetails: parsed.data.existingProductDetails,
        newDevPlan: parsed.data.newDevPlan,
      },
      { bypassHeadCheck: bypassHead }
    );
  } catch (err) {
    console.error("[POST /api/orders/[id]/handoff]", err);
    return NextResponse.json({ error: "Failed to save assignment" }, { status: 500 });
  }
  if (!order) {
    return NextResponse.json(
      {
        error:
          "Cannot update assignment (enquiry must be in progress, not shipped yet, supervisor must belong to this division, and planning/details must meet requirements).",
      },
      { status: 400 }
    );
  }
  return NextResponse.json(order);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await withAuth();
  if (auth.response) return auth.response;
  if (auth.payload.role !== "MANAGING_DIRECTOR") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid enquiry id" }, { status: 400 });
  }
  const orderRow = await prisma.order.findUnique({
    where: { id },
    select: { id: true, createdById: true, currentDivisionId: true, previousDivisionId: true, status: true, sampleShippedAt: true },
  });
  if (!orderRow) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const canView = await userCanViewOrder(auth.payload, orderRow);
  if (!canView) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (orderRow.sampleShippedAt) {
    return NextResponse.json({ error: "Cannot clear assignment after sample has been shipped." }, { status: 400 });
  }
  const updated = await prisma.order.update({
    where: { id },
    data: { assignedSupervisorId: null, enquiryHandoff: Prisma.DbNull },
  });
  return NextResponse.json({ ok: true, orderId: updated.id });
}
