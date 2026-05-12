/**
 * GET /api/orders/[id]/timeline — full workflow timeline for a single enquiry.
 * RBAC is delegated to userCanViewOrder.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { userCanViewOrder } from "@/lib/order-view-permission";
import { getEnquiryTimeline } from "@/lib/timeline";
import { canViewCustomerFeedback } from "@/lib/roles";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await withAuth();
  if (auth.response) return auth.response;
  const { id } = await ctx.params;
  const orderId = Number(id);
  if (!Number.isInteger(orderId) || orderId < 1) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, createdById: true, currentDivisionId: true, previousDivisionId: true },
  });
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const can = await userCanViewOrder(auth.payload, order);
  if (!can) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const events = await getEnquiryTimeline(orderId, 300);
  const filteredEvents = canViewCustomerFeedback(auth.payload.role)
    ? events
    : events.filter((e) => e.type !== "CUSTOMER_FEEDBACK");
  return NextResponse.json({
    events: filteredEvents.map((e) => ({
      id: e.id,
      type: e.type,
      title: e.title,
      detail: e.detail,
      createdAt: e.createdAt.toISOString(),
      actor: e.actor,
    })),
  });
}
