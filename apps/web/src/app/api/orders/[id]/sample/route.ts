import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import {
  canSubmitSalesFeedbackAsync,
  runSampleAction,
  userCanManageSampleForOrder,
} from "@/lib/order-sample-actions";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await withAuth();
  if (auth.response) return auth.response;
  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
  }
  const order = await prisma.order.findUnique({
    where: { id },
    select: { id: true, currentDivisionId: true, createdById: true },
  });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  if (auth.payload.role === "USER" && order.createdById !== Number(auth.payload.sub)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const action = body?.action as string | undefined;

  const userId = Number(auth.payload.sub);

  if (action === "salesFeedback") {
    const ok = await canSubmitSalesFeedbackAsync(userId, auth.payload.role, order);
    if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  } else {
    const ok = await userCanManageSampleForOrder(userId, auth.payload.role, order.currentDivisionId);
    if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return runSampleAction(id, userId, body);
}
