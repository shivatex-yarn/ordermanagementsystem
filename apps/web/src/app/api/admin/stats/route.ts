import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withRole } from "@/lib/with-auth";

/**
 * Super Admin / Managing Director: metrics for the admin console.
 *
 * The Neon pooler hands each instance a single connection, so these run one
 * after another. A `Promise.all` here exhausts the pool and times out.
 */
export async function GET() {
  const auth = await withRole(["SUPER_ADMIN", "MANAGING_DIRECTOR"]);
  if (auth.response) return auth.response;

  const ordersByStatus = await prisma.order.groupBy({
    by: ["status"],
    _count: { id: true },
  });
  const totalOrders = await prisma.order.count();
  const totalDivisions = await prisma.division.count();
  const totalUsers = await prisma.user.count();
  const activeUsers = await prisma.user.count({ where: { active: true } });
  const slaBreachesCount = await prisma.sLABreach.count({ where: { resolvedAt: null } });
  const recentAuditCount = await prisma.auditLog.count();

  const usersByRole = await prisma.user.groupBy({
    by: ["role"],
    _count: { _all: true },
  });

  const ordersByStatusMap = ordersByStatus.reduce(
    (acc, x) => {
      acc[x.status] = x._count.id;
      return acc;
    },
    {} as Record<string, number>
  );

  return NextResponse.json({
    ordersByStatus: [
      { status: "PLACED", count: ordersByStatusMap["PLACED"] ?? 0 },
      { status: "IN_PROGRESS", count: ordersByStatusMap["IN_PROGRESS"] ?? 0 },
      { status: "TRANSFERRED", count: ordersByStatusMap["TRANSFERRED"] ?? 0 },
      { status: "REJECTED", count: ordersByStatusMap["REJECTED"] ?? 0 },
      { status: "COMPLETED", count: ordersByStatusMap["COMPLETED"] ?? 0 },
      { status: "CANCELLED", count: ordersByStatusMap["CANCELLED"] ?? 0 },
    ],
    usersByRole: usersByRole
      .map((r) => ({ role: r.role, count: r._count._all }))
      .sort((a, b) => b.count - a.count),
    totalOrders,
    totalDivisions,
    totalUsers,
    activeUsers,
    slaBreachesCount,
    recentAuditCount,
  });
}
