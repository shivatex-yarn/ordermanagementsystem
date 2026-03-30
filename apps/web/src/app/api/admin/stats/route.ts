import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withRole } from "@/lib/with-auth";

/** Super Admin only: metrics for admin dashboard */
export async function GET() {
  const auth = await withRole(["SUPER_ADMIN", "MANAGING_DIRECTOR"]);
  if (auth.response) return auth.response;

  const [
    ordersByStatus,
    totalOrders,
    totalDivisions,
    slaBreachesCount,
    recentAuditCount,
  ] = await Promise.all([
    prisma.order.groupBy({
      by: ["status"],
      _count: { id: true },
    }),
    prisma.order.count(),
    prisma.division.count(),
    prisma.sLABreach.count({ where: { resolvedAt: null } }),
    prisma.auditLog.count(),
  ]);

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
    totalOrders,
    totalDivisions,
    slaBreachesCount,
    recentAuditCount,
  });
}
