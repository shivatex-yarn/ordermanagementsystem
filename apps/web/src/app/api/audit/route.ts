import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withRole } from "@/lib/with-auth";

export async function GET(req: Request) {
  const auth = await withRole(["SUPER_ADMIN", "MANAGING_DIRECTOR", "MANAGER"]);
  if (auth.response) return auth.response;
  const { searchParams } = new URL(req.url);
  const orderId = searchParams.get("orderId");
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit")) || 20));
  let where: { orderId?: number | { in: number[] } } = orderId ? { orderId: Number(orderId) } : {};
  if (auth.payload.role === "MANAGER" && auth.payload.divisionId && !orderId) {
    const orderIds = await prisma.order.findMany({
      where: { currentDivisionId: auth.payload.divisionId },
      select: { id: true },
    });
    where = { orderId: { in: orderIds.map((o) => o.id) } };
  }
  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);
  return NextResponse.json({ logs, total, page, limit });
}
