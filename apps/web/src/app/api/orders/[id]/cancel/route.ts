import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logAudit, notify, salesInDivision, superAdminIds } from "@/lib/activity";
import { withAuth } from "@/lib/with-auth";
import { getScopedOrder } from "@/lib/orders";
import { cancelOrderSchema } from "@/lib/validation";
import { appendTimeline } from "@/lib/timeline";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await withAuth();
  if (auth.response) return auth.response;
  if (auth.payload.role !== "MARKETING" && auth.payload.role !== "SALES" && auth.payload.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const id = Number((await ctx.params).id);
  const order = await getScopedOrder(id, auth.payload);
  if (!order) return NextResponse.json({ error: "Enquiry not found" }, { status: 404 });
  if (order.status === "CLOSED" || order.status === "CANCELLED") {
    return NextResponse.json({ error: "This enquiry is already finished" }, { status: 409 });
  }
  const parsed = cancelOrderSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const updated = await prisma.order.update({
    where: { id },
    data: { status: "CANCELLED", cancellationReason: parsed.data.reason, closedAt: new Date() },
  });
  await appendTimeline({ orderId: id, type: "ENQUIRY_CANCELLED", title: "Enquiry cancelled", detail: parsed.data.reason, actorId: Number(auth.payload.sub) });
  await logAudit({ actor: auth.payload, action: "ENQUIRY_CANCELLED", category: "ENQUIRY", entityType: "Order", entityId: id, entityLabel: order.orderNumber, detail: parsed.data.reason, req });
  void notify([order.createdById, order.pricedById], { type: "ENQUIRY_CANCELLED", title: `${order.orderNumber} was cancelled`, body: parsed.data.reason, link: `/orders/${id}` }, Number(auth.payload.sub));
  return NextResponse.json(updated);
}
