import { NextResponse } from "next/server";
import { withRole } from "@/lib/with-auth";
import { receiveOrderSchema } from "@/lib/validation";
import { receiveOrder } from "@/lib/order-engine";
import { prisma } from "@/lib/db";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await withRole(["MANAGER", "SUPER_ADMIN"]);
  if (auth.response) return auth.response;
  const id = Number((await params).id);
  const parsed = receiveOrderSchema.safeParse({ orderId: id });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
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
  const order = await receiveOrder(parsed.data.orderId, Number(auth.payload.sub));
  if (!order) {
    return NextResponse.json(
      { error: "Order not found or not in TRANSFERRED state" },
      { status: 400 }
    );
  }
  return NextResponse.json(order);
}
