import { NextResponse } from "next/server";
import { withRole } from "@/lib/with-auth";
import { transferOrderSchema } from "@/lib/validation";
import { transferOrder } from "@/lib/order-engine";
import { prisma } from "@/lib/db";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await withRole(["MANAGER", "SUPER_ADMIN"]);
  if (auth.response) return auth.response;
  const id = Number((await params).id);
  const body = await req.json();
  const parsed = transferOrderSchema.safeParse({ ...body, orderId: id });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const gate = await prisma.sLABreach.findFirst({
    where: { orderId: parsed.data.orderId, resolvedAt: null, headRejectedAt: null },
    select: { id: true },
  });
  if (gate) {
    return NextResponse.json(
      { error: "SLA breach requires Division Head rejection message before proceeding." },
      { status: 409 }
    );
  }
  const order = await transferOrder(
    parsed.data.orderId,
    Number(auth.payload.sub),
    parsed.data.toDivisionId,
    parsed.data.reason
  );
  if (!order) {
    return NextResponse.json(
      { error: "Order not found or cannot be transferred in current state" },
      { status: 400 }
    );
  }
  return NextResponse.json(order);
}
