import { NextResponse } from "next/server";
import { withRole } from "@/lib/with-auth";
import { receiveOrderSchema } from "@/lib/validation";
import { receiveOrder } from "@/lib/order-engine";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await withRole(["MANAGER", "DIVISION_HEAD", "SUPER_ADMIN"]);
    if (auth.response) return auth.response;
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id < 1) {
      return NextResponse.json({ error: "Invalid enquiry id" }, { status: 400 });
    }
    const body = await req.json().catch(() => ({}));
    const parsed = receiveOrderSchema.safeParse({ orderId: id, reason: (body as Record<string, unknown>)?.reason });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const order = await receiveOrder(parsed.data.orderId, Number(auth.payload.sub), parsed.data.reason);
    if (!order) {
      return NextResponse.json(
        { error: "Order not found or not in TRANSFERRED state" },
        { status: 400 }
      );
    }
    return NextResponse.json(order);
  } catch (err) {
    console.error("[receive] unexpected error:", err);
    return NextResponse.json({ error: "Failed to receive enquiry. Please try again." }, { status: 500 });
  }
}
