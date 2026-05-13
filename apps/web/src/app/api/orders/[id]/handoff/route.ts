import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { submitEnquiryHandoff } from "@/lib/order-engine";
import { userCanViewOrder } from "@/lib/order-view-permission";
import { enquiryHandoffSchema } from "@/lib/validation";
import { withRole } from "@/lib/with-auth";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await withRole(["MANAGER", "DIVISION_HEAD", "SUPER_ADMIN", "MANAGING_DIRECTOR"]);
  if (auth.response) return auth.response;
  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid enquiry id" }, { status: 400 });
  }
  const rawBody = await req.json().catch(() => ({}));
  let body = rawBody as Record<string, unknown>;
  /** Supervisor-only reassignment: allow omitting `newDevPlan` when full planning is already stored. */
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
    select: { id: true, createdById: true, currentDivisionId: true, previousDivisionId: true },
  });
  if (!orderRow) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const canView = await userCanViewOrder(auth.payload, orderRow);
  if (!canView) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const bypassHead =
    auth.payload.role === "SUPER_ADMIN" || auth.payload.role === "MANAGING_DIRECTOR";
  const order = await submitEnquiryHandoff(
    parsed.data.orderId,
    Number(auth.payload.sub),
    {
      supervisorId: parsed.data.supervisorId,
      developmentKind: parsed.data.developmentKind,
      newDevelopmentDetails: parsed.data.newDevelopmentDetails,
      existingProductDetails: parsed.data.existingProductDetails,
      newDevPlan: parsed.data.newDevPlan,
    },
    { bypassHeadCheck: bypassHead }
  );
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
