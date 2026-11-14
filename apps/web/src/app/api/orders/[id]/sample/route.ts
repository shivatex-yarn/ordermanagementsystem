import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logAudit, notify } from "@/lib/activity";
import { withAuth } from "@/lib/with-auth";
import { getScopedOrder } from "@/lib/orders";
import { sampleSchema } from "@/lib/validation";
import { appendTimeline } from "@/lib/timeline";
import { canPrice } from "@/lib/roles";

/** Marketing writes remarks on the sample (or on the full order). No dates or courier details. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await withAuth();
  if (auth.response) return auth.response;
  if (!canPrice(auth.payload.role)) return NextResponse.json({ error: "Only Marketing can add remarks" }, { status: 403 });
  const id = Number((await ctx.params).id);
  const order = await getScopedOrder(id, auth.payload);
  if (!order) return NextResponse.json({ error: "Enquiry not found" }, { status: 404 });
  const parsed = sampleSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const remarks = parsed.data.sampleRemarks;
  const kind = order.isSample ? "Sample" : "Order";
  const updated = await prisma.order.update({
    where: { id },
    // For a sample, saving remarks ticks the "Sample" step (dashboards count it); full orders have no such step.
    data: { sampleRemarks: remarks, ...(order.isSample && !order.sampleSentAt ? { sampleSentAt: new Date() } : {}) },
  });
  await appendTimeline({ orderId: id, type: "SAMPLE_UPDATED", title: `${kind} remarks updated`, detail: remarks, actorId: Number(auth.payload.sub) });
  await logAudit({ actor: auth.payload, action: "REMARKS_UPDATED", category: "ENQUIRY", entityType: "Order", entityId: id, entityLabel: order.orderNumber, detail: remarks.slice(0, 160), req });
  void notify([order.createdById], { type: "SAMPLE_SENT", title: `${kind} remarks on ${order.orderNumber}`, body: remarks.slice(0, 140), link: `/orders/${id}` }, Number(auth.payload.sub));
  return NextResponse.json(updated);
}
