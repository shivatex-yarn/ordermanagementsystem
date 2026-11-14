import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logAudit, notify } from "@/lib/activity";
import { withAuth } from "@/lib/with-auth";
import { getScopedOrder } from "@/lib/orders";
import { appendTimeline } from "@/lib/timeline";
import { canPrice } from "@/lib/roles";

/** Reopen an enquiry the client declined, so more feedback can be recorded (e.g. the client came back after a better price). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await withAuth();
  if (auth.response) return auth.response;
  if (!canPrice(auth.payload.role)) return NextResponse.json({ error: "Only Marketing can reopen an enquiry" }, { status: 403 });
  const id = Number((await ctx.params).id);
  const order = await getScopedOrder(id, auth.payload);
  if (!order) return NextResponse.json({ error: "Enquiry not found" }, { status: 404 });
  if (order.status !== "CLOSED" || order.clientResponse !== "DECLINED") {
    return NextResponse.json({ error: "Only an enquiry the client declined can be reopened" }, { status: 409 });
  }
  const updated = await prisma.order.update({ where: { id }, data: { status: "PRICED", clientResponse: "NEGOTIATING", closedAt: null } });
  await appendTimeline({ orderId: id, type: "ENQUIRY_REOPENED", title: "Enquiry reopened after the client declined", actorId: Number(auth.payload.sub) });
  await logAudit({ actor: auth.payload, action: "ENQUIRY_REOPENED", category: "ENQUIRY", entityType: "Order", entityId: id, entityLabel: order.orderNumber, req });
  void notify([order.createdById, order.pricedById], { type: "CLIENT_FEEDBACK", title: `${order.orderNumber} was reopened`, body: "The client had declined. It is open again for feedback.", link: `/orders/${id}` }, Number(auth.payload.sub));
  return NextResponse.json(updated);
}
