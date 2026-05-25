import { NextResponse } from "next/server";
import { withRole } from "@/lib/with-auth";
import { completeOrderSchema } from "@/lib/validation";
import { completeOrder } from "@/lib/order-engine";
import { prisma } from "@/lib/db";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await withRole(["MANAGER", "DIVISION_HEAD", "SUPER_ADMIN"]);
    if (auth.response) return auth.response;
    const id = Number((await params).id);
    const parsed = completeOrderSchema.safeParse({ orderId: id });
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
    }
    const gate = await prisma.sLABreach.findFirst({
      where: { orderId: parsed.data.orderId, resolvedAt: null, headRejectedAt: null },
      select: { id: true },
    });
    if (gate) {
      return NextResponse.json(
        { error: "SLA breach requires Division Head rejection message before proceeding." },
        { status: 409 }
      );
    }
    const order = await completeOrder(parsed.data.orderId, Number(auth.payload.sub));
    if (!order) {
      const row = await prisma.order.findUnique({
        where: { id: parsed.data.orderId },
        select: {
          status: true,
          sampleRequested: true,
          sampleApprovedAt: true,
          sampleSpecsAcknowledgedAt: true,
        },
      });
      let message = "Enquiry not found or not in progress.";
      if (row?.status === "IN_PROGRESS" && row.sampleRequested) {
        if (!row.sampleApprovedAt) {
          message =
            "Complete the sample workflow first: head-approved sample specifications are required before closing this enquiry.";
        } else if (!row.sampleSpecsAcknowledgedAt) {
          message =
            "The enquiry submitter must confirm they have reviewed the approved sample specifications on this page before you can mark the enquiry complete.";
        }
      }
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json(order);
  } catch (err) {
    console.error("[complete] unexpected error:", err);
    return NextResponse.json({ error: "Failed to complete enquiry. Please try again." }, { status: 500 });
  }
}
