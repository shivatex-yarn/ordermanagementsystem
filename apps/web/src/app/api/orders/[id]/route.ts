import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { cacheGet, cacheSet, cacheDel, cacheKeyOrder } from "@/lib/redis";

const fullInclude = {
  createdBy: { select: { id: true, name: true, email: true } },
  currentDivision: { select: { id: true, name: true } },
  previousDivision: { select: { id: true, name: true } },
  acceptedBy: { select: { id: true, name: true, email: true } },
  rejectedBy: { select: { id: true, name: true, email: true } },
  receivedBy: { select: { id: true, name: true, email: true } },
  completedBy: { select: { id: true, name: true, email: true } },
  transfers: {
    include: {
      fromDivision: { select: { id: true, name: true } },
      toDivision: { select: { id: true, name: true } },
      transferredBy: { select: { id: true, name: true, email: true } },
    },
  },
  rejections: {
    include: {
      division: { select: { id: true, name: true } },
      rejectedBy: { select: { id: true, name: true, email: true } },
    },
  },
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await withAuth();
  if (auth.response) return auth.response;
  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
  }
  const cached = await cacheGet<unknown>(cacheKeyOrder(id));
  if (cached) return NextResponse.json(cached);

  const order = await prisma.order.findUnique({
    where: { id },
    include: fullInclude,
  });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  if (auth.payload.role === "USER" && order.createdById !== Number(auth.payload.sub)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (["MANAGER", "SUPERVISOR"].includes(auth.payload.role) && auth.payload.divisionId) {
    if (order.currentDivisionId !== auth.payload.divisionId && order.createdById !== Number(auth.payload.sub)) {
      const inDivisionHistory =
        order.previousDivisionId === auth.payload.divisionId ||
        order.currentDivisionId === auth.payload.divisionId;
      if (!inDivisionHistory && auth.payload.role !== "SUPER_ADMIN") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
  }

  await cacheSet(cacheKeyOrder(id), order, 120);
  return NextResponse.json(order);
}
