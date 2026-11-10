import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logAudit, notify, salesInDivision, superAdminIds } from "@/lib/activity";
import { withAuth } from "@/lib/with-auth";
import { getScopedOrder } from "@/lib/orders";
import { pricingSchema } from "@/lib/validation";
import { appendTimeline } from "@/lib/timeline";
import { canPrice } from "@/lib/roles";

/** Marketing adds (or revises) pricing. Moves a new enquiry to PRICED. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await withAuth();
  if (auth.response) return auth.response;
  if (!canPrice(auth.payload.role)) return NextResponse.json({ error: "Only Marketing can add pricing" }, { status: 403 });
  const id = Number((await ctx.params).id);
  const order = await getScopedOrder(id, auth.payload);
  if (!order) return NextResponse.json({ error: "Enquiry not found" }, { status: 404 });
  if (order.status === "CLOSED" || order.status === "CANCELLED") {
    return NextResponse.json({ error: "This enquiry is already finished" }, { status: 409 });
  }
  const parsed = pricingSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const d = parsed.data;
  const revised = order.pricedAt !== null;
  const updated = await prisma.order.update({
    where: { id },
    data: {
      pricePerUnit: d.pricePerUnit,
      priceUnit: d.priceUnit,
      quantity: d.quantity ?? null,
      paymentTerms: d.paymentTerms ?? null,
      deliveryTime: d.deliveryTime ?? null,
      pricingNotes: d.pricingNotes ?? null,
      pricedAt: new Date(),
      pricedById: Number(auth.payload.sub),
      status: "PRICED",
    },
  });
  await appendTimeline({
    orderId: id,
    type: "PRICING_ADDED",
    title: revised ? "Pricing revised" : "Pricing added",
    detail: `${d.pricePerUnit} per ${d.priceUnit}`,
    actorId: Number(auth.payload.sub),
  });
  await logAudit({ actor: auth.payload, action: revised ? "PRICING_REVISED" : "PRICING_ADDED", category: "ENQUIRY", entityType: "Order", entityId: id, entityLabel: order.orderNumber, detail: `${d.pricePerUnit} per ${d.priceUnit}`, req });
  void notify([order.createdById, order.assignedToId], { type: "PRICING_ADDED", title: `Pricing ${revised ? "revised" : "added"} on ${order.orderNumber}`, body: `${d.pricePerUnit} per ${d.priceUnit}. You can quote the client now.`, link: `/orders/${id}` }, Number(auth.payload.sub));
  return NextResponse.json(updated);
}
