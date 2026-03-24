import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withRole } from "@/lib/with-auth";

/** Managing Director + Super Admin: workflow / escalation visibility */
export async function GET() {
  const auth = await withRole(["MANAGING_DIRECTOR", "SUPER_ADMIN"]);
  if (auth.response) return auth.response;

  const now = new Date();
  const [
    statusCounts,
    openBreaches,
    delayedEnquiries,
    recentBreaches,
  ] = await Promise.all([
    prisma.order.groupBy({
      by: ["status"],
      _count: { id: true },
    }),
    prisma.sLABreach.count({ where: { resolvedAt: null } }),
    prisma.order.findMany({
      where: {
        status: { in: ["PLACED", "TRANSFERRED"] },
        slaDeadline: { lt: now },
      },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        slaDeadline: true,
        currentDivision: { select: { id: true, name: true } },
      },
      orderBy: { slaDeadline: "asc" },
      take: 50,
    }),
    prisma.sLABreach.findMany({
      where: { resolvedAt: null },
      include: {
        order: { select: { id: true, orderNumber: true, status: true } },
        division: { select: { id: true, name: true } },
      },
      orderBy: { breachedAt: "desc" },
      take: 30,
    }),
  ]);

  return NextResponse.json({
    statusCounts: Object.fromEntries(statusCounts.map((r) => [r.status, r._count.id])),
    openBreaches,
    delayedEnquiries,
    recentBreaches,
  });
}
