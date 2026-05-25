/**
 * POST /api/orders/[id]/customer-feedback
 *
 * Salesperson (the original creator) submits customer feedback after sample handover.
 * The body is stored in `customerFeedback`; visibility is controlled at the read side
 * (canViewCustomerFeedback role check).
 *
 * Body: { feedback: string, sampleStatus?: string, sampleReceivedAt?: string }
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { appendTimeline } from "@/lib/timeline";
import { publish } from "@/lib/events";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await withAuth();
  if (auth.response) return auth.response;
  const { id } = await ctx.params;
  const orderId = Number(id);
  if (!Number.isInteger(orderId) || orderId < 1) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const userId = Number(auth.payload.sub);

  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, orderNumber: true, createdById: true, currentDivisionId: true, status: true },
    });
    if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

    /** Spec: salesperson updates feedback. Allow original creator (USER/SUPERVISOR/ASM) + admin bypass. */
    const role = auth.payload.role;
    const adminBypass = role === "SUPER_ADMIN";
    if (!adminBypass && order.createdById !== userId) {
      return NextResponse.json({ error: "Only the creator can submit customer feedback" }, { status: 403 });
    }
    if (order.status === "REJECTED" || order.status === "CANCELLED") {
      return NextResponse.json({ error: "Enquiry is closed" }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      feedback?: unknown;
      sampleStatus?: unknown;
      sampleReceivedAt?: unknown;
      responseStatus?: unknown;
      remarks?: unknown;
    };
    const feedback = typeof body.feedback === "string" ? body.feedback.trim() : "";
    if (feedback.length < 5) {
      return NextResponse.json({ error: "Customer feedback is required (min 5 chars)" }, { status: 400 });
    }
    const sampleStatus = typeof body.sampleStatus === "string" ? body.sampleStatus.trim() : null;
    const responseStatus = typeof body.responseStatus === "string" ? body.responseStatus.trim() : null;
    const remarks = typeof body.remarks === "string" ? body.remarks.trim() : null;
    const parsedReceived = body.sampleReceivedAt ? new Date(String(body.sampleReceivedAt)) : null;
    const sampleReceivedAt =
      parsedReceived && !Number.isNaN(parsedReceived.getTime()) ? parsedReceived : null;

    const updated = await prisma.order.update({
      where: { id: orderId },
      data: {
        customerFeedback: feedback,
        customerFeedbackAt: new Date(),
        ...(responseStatus ? { customerResponseStatus: responseStatus } : {}),
        ...(remarks ? { customerFeedbackRemarks: remarks } : {}),
        ...(sampleReceivedAt ? { sampleReceivedAt } : {}),
      },
      select: { id: true, orderNumber: true, customerFeedback: true, customerFeedbackAt: true, sampleReceivedAt: true, customerResponseStatus: true, customerFeedbackRemarks: true },
    });

    await appendTimeline({
      orderId,
      type: "CUSTOMER_FEEDBACK",
      title: "Customer feedback submitted",
      detail: responseStatus ? `Response: ${responseStatus}${sampleStatus ? ` · ${sampleStatus}` : ""}` : (sampleStatus ?? null),
      actorId: userId,
      metadata: { feedbackLength: feedback.length, sampleStatus, sampleReceivedAt: sampleReceivedAt?.toISOString() ?? null },
    });
    await publish({
      type: "SalesFeedbackRecorded",
      orderId,
      orderNumber: order.orderNumber,
      submittedById: userId,
      timestamp: new Date().toISOString(),
      userId,
    });

    return NextResponse.json({ ok: true, enquiry: updated });
  } catch (err) {
    console.error("[customer-feedback] unexpected error:", err);
    return NextResponse.json({ error: "Failed to submit feedback. Please try again." }, { status: 500 });
  }
}
