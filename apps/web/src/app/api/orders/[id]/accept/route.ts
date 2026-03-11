import { NextResponse } from "next/server";
import { withRole } from "@/lib/with-auth";
import { acceptOrderSchema } from "@/lib/validation";
import { acceptOrder } from "@/lib/order-engine";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await withRole(["MANAGER", "SUPER_ADMIN"]);
  if (auth.response) return auth.response;
  const id = Number((await params).id);
  const parsed = acceptOrderSchema.safeParse({ orderId: id });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
  }
  const order = await acceptOrder(parsed.data.orderId, Number(auth.payload.sub));
  if (!order) {
    return NextResponse.json(
      { error: "Order not found or cannot be accepted in current state" },
      { status: 400 }
    );
  }
  return NextResponse.json(order);
}
