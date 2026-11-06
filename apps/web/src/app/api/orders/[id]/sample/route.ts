import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { getScopedOrder } from "@/lib/orders";
import { sampleSchema } from "@/lib/validation";
import { appendTimeline } from "@/lib/timeline";
import { canPrice } from "@/lib/roles";

/** Sales records the sample that was sent (courier, tracking, date). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await withAuth();
  if (auth.response) return auth.response;
  if (!canPrice(auth.payload.role)) return NextResponse.json({ error: "Only Sales can update the sample" }, { status: 403 });
  const id = Number((await ctx.params).id);
  const order = await getScopedOrder(id, auth.payload);
  if (!order) return NextResponse.json({ error: "Enquiry not found" }, { status: 404 });
  if (!order.isSample) return NextResponse.json({ error: "This enquiry isn't marked as a sample" }, { status: 400 });
  const parsed = sampleSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const d = parsed.data;
  const updated = await prisma.order.update({
    where: { id },
    data: {
      sampleSentAt: d.sampleSentAt ? new Date(d.sampleSentAt) : new Date(),
      sampleCourierName: d.sampleCourierName ?? null,
      sampleTrackingId: d.sampleTrackingId ?? null,
      sampleRemarks: d.sampleRemarks ?? null,
    },
  });
  await appendTimeline({
    orderId: id,
    type: "SAMPLE_UPDATED",
    title: "Sample sent",
    detail: [d.sampleCourierName, d.sampleTrackingId].filter(Boolean).join(" · ") || null,
    actorId: Number(auth.payload.sub),
  });
  return NextResponse.json(updated);
}
