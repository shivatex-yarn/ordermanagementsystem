import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { getScopedOrder } from "@/lib/orders";
import { feedbackSchema } from "@/lib/validation";
import { appendTimeline } from "@/lib/timeline";
import { canPrice } from "@/lib/roles";

/** Sales records the client's feedback. Accepted / declined closes the enquiry. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await withAuth();
  if (auth.response) return auth.response;
  if (!canPrice(auth.payload.role)) return NextResponse.json({ error: "Only Sales can record client feedback" }, { status: 403 });
  const id = Number((await ctx.params).id);
  const order = await getScopedOrder(id, auth.payload);
  if (!order) return NextResponse.json({ error: "Enquiry not found" }, { status: 404 });
  if (order.status === "CANCELLED") return NextResponse.json({ error: "This enquiry was cancelled" }, { status: 409 });
  if (!order.pricedAt) return NextResponse.json({ error: "Add pricing before recording client feedback" }, { status: 409 });
  const parsed = feedbackSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const { clientFeedback, clientResponse } = parsed.data;
  const close = clientResponse !== "NEGOTIATING";
  const updated = await prisma.order.update({
    where: { id },
    data: {
      clientFeedback,
      clientResponse,
      clientFeedbackAt: new Date(),
      status: close ? "CLOSED" : "PRICED",
      closedAt: close ? new Date() : null,
    },
  });
  await appendTimeline({
    orderId: id,
    type: close ? "ENQUIRY_CLOSED" : "CLIENT_FEEDBACK",
    title: close ? `Client ${clientResponse === "ACCEPTED" ? "accepted" : "declined"}. Enquiry closed` : "Client is negotiating",
    detail: clientFeedback,
    actorId: Number(auth.payload.sub),
  });
  return NextResponse.json(updated);
}
