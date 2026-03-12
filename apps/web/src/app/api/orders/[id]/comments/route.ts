import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { createOrderCommentSchema } from "@/lib/validation";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await withAuth();
  if (auth.response) return auth.response;
  const orderId = Number((await params).id);
  if (!Number.isInteger(orderId)) {
    return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
  }
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      createdById: true,
      currentDivisionId: true,
      previousDivisionId: true,
    },
  });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  if (auth.payload.role === "USER" && order.createdById !== Number(auth.payload.sub)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (["MANAGER", "SUPERVISOR"].includes(auth.payload.role) && auth.payload.divisionId) {
    const canView =
      order.currentDivisionId === auth.payload.divisionId ||
      order.previousDivisionId === auth.payload.divisionId;
    if (!canView && auth.payload.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const comments = await prisma.orderComment.findMany({
    where: { orderId },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ comments });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await withAuth();
  if (auth.response) return auth.response;
  const orderId = Number((await params).id);
  if (!Number.isInteger(orderId)) {
    return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
  }
  const body = await req.json();
  const parsed = createOrderCommentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      createdById: true,
      currentDivisionId: true,
      previousDivisionId: true,
    },
  });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const userId = Number(auth.payload.sub);
  const canComment =
    auth.payload.role === "SUPER_ADMIN" ||
    order.createdById === userId ||
    (["MANAGER", "SUPERVISOR"].includes(auth.payload.role) &&
      (order.currentDivisionId === auth.payload.divisionId ||
        order.previousDivisionId === auth.payload.divisionId));
  if (!canComment) {
    return NextResponse.json(
      { error: "Only Division Heads, creator, or Super Admin can add comments" },
      { status: 403 }
    );
  }

  const comment = await prisma.orderComment.create({
    data: { orderId, userId, body: parsed.data.body },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  return NextResponse.json(comment, { status: 201 });
}
