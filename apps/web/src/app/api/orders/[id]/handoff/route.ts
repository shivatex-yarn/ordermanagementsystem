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
  const body = await req.json().catch(() => ({}));
  const parsed = enquiryHandoffSchema.safeParse({
    orderId: id,
    supervisorId: body?.supervisorId,
    developmentKind: body?.developmentKind,
    newDevelopmentDetails: body?.newDevelopmentDetails,
    existingProductDetails: body?.existingProductDetails,
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
    },
    { bypassHeadCheck: bypassHead }
  );
  if (!order) {
    return NextResponse.json(
      {
        error:
          "Cannot submit handoff (enquiry must be accepted, handoff not already done, supervisor must belong to this division, and details must meet requirements).",
      },
      { status: 400 }
    );
  }
  return NextResponse.json(order);
}
