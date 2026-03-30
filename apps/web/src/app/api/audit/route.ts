import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { userCanViewOrder } from "@/lib/order-view-permission";
import { withAuth } from "@/lib/with-auth";

function payloadSnippet(p: unknown): string {
  if (p == null) return "";
  try {
    const s = JSON.stringify(p);
    return s.length > 280 ? `${s.slice(0, 280)}…` : s;
  } catch {
    return "";
  }
}

export async function GET(req: Request) {
  const auth = await withAuth();
  if (auth.response) return auth.response;

  const { searchParams } = new URL(req.url);
  const orderIdParam = searchParams.get("orderId");
  const actionFilter = searchParams.get("action")?.trim() || undefined;
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const rawLimit = Number(searchParams.get("limit")) || 20;
  const limit = orderIdParam
    ? Math.min(200, Math.max(1, rawLimit))
    : Math.min(100, Math.max(1, rawLimit));

  const { role } = auth.payload;

  const where: Prisma.AuditLogWhereInput = {};
  if (actionFilter) {
    where.action = actionFilter;
  }

  if (orderIdParam) {
    const oid = Number(orderIdParam);
    if (!Number.isInteger(oid)) {
      return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
    }
    const order = await prisma.order.findUnique({
      where: { id: oid },
      select: { id: true, createdById: true, currentDivisionId: true, previousDivisionId: true },
    });
    if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const ok = await userCanViewOrder(auth.payload, order);
    if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    where.orderId = oid;
  } else {
    if (!["SUPER_ADMIN", "MANAGING_DIRECTOR", "MANAGER"].includes(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (role === "MANAGER" && auth.payload.divisionId) {
      const orderIds = await prisma.order.findMany({
        where: { currentDivisionId: auth.payload.divisionId },
        select: { id: true },
      });
      where.orderId = { in: orderIds.map((o) => o.id) };
    }
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        user: { select: { id: true, name: true, email: true } },
        order: { select: { id: true, orderNumber: true } },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  const serialized = logs.map((l) => ({
    id: l.id,
    orderId: l.orderId,
    action: l.action,
    createdAt: l.createdAt.toISOString(),
    payload: l.payload,
    payloadPreview: payloadSnippet(l.payload),
    user: l.user ? { name: l.user.name, email: l.user.email } : null,
    orderNumber: l.order.orderNumber,
  }));

  return NextResponse.json({ logs: serialized, total, page, limit });
}
