import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { userCanViewOrder } from "@/lib/order-view-permission";
import { withAuth } from "@/lib/with-auth";

/** Supervisors (ASM) in the same division as the enquiry — for head assignment only. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await withAuth();
  if (auth.response) return auth.response;
  if (!["MANAGER", "DIVISION_HEAD", "SUPER_ADMIN", "MANAGING_DIRECTOR"].includes(auth.payload.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid enquiry id" }, { status: 400 });
  }
  const orderRow = await prisma.order.findUnique({
    where: { id },
    select: { id: true, createdById: true, currentDivisionId: true, previousDivisionId: true },
  });
  if (!orderRow) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const canView = await userCanViewOrder(auth.payload, orderRow);
  if (!canView) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supervisors = await prisma.user.findMany({
    where: {
      divisionId: orderRow.currentDivisionId,
      role: { in: ["SUPERVISOR", "ASM"] },
      active: true,
    },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ supervisors });
}
