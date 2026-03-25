import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { withRole } from "@/lib/with-auth";

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
  const auth = await withRole(["SUPER_ADMIN", "MANAGING_DIRECTOR", "MANAGER"]);
  if (auth.response) return auth.response;
  const { searchParams } = new URL(req.url);
  const orderId = searchParams.get("orderId");
  const actionFilter = searchParams.get("action")?.trim() || undefined;
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit")) || 20));

  const where: Prisma.AuditLogWhereInput = {};
  if (actionFilter) {
    where.action = actionFilter;
  }
  if (orderId) {
    where.orderId = Number(orderId);
  } else if (auth.payload.role === "MANAGER" && auth.payload.divisionId) {
    const orderIds = await prisma.order.findMany({
      where: { currentDivisionId: auth.payload.divisionId },
      select: { id: true },
    });
    where.orderId = { in: orderIds.map((o) => o.id) };
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
