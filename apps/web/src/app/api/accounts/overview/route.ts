/**
 * GET /api/accounts/overview — Accounts dashboard data.
 *
 * Accounts Team has read-only visibility across all divisions for commercial tracking
 * and customer-level rollup. They can see customer feedback per spec.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withRole } from "@/lib/with-auth";
import { dbUnavailableJson, isDbUnavailableError } from "@/lib/db-errors";

export async function GET() {
  const auth = await withRole(["ACCOUNTS", "SUPER_ADMIN", "MANAGING_DIRECTOR"]);
  if (auth.response) return auth.response;

  const safe = async <T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn();
    } catch (err) {
      console.warn(`[accounts/overview] ${label} skipped:`, err instanceof Error ? err.message : err);
      return fallback;
    }
  };

  try {
    const [statusCounts, byDivision, recent, totalCustomers, openCount] = await Promise.all([
      safe(
        "statusCounts",
        () => prisma.order.groupBy({ by: ["status"], _count: { id: true } }),
        [] as Array<{ status: string; _count: { id: number } }>
      ),
      safe(
        "byDivision",
        () =>
          prisma.order.groupBy({
            by: ["currentDivisionId", "status"],
            _count: { id: true },
          }),
        [] as Array<{ currentDivisionId: number; status: string; _count: { id: number } }>
      ),
      // Try with new columns first; fall back to legacy projection if `priority` / `productKind` don't exist yet.
      safe(
        "recent",
        async () => {
          try {
            return await prisma.order.findMany({
              take: 200,
              orderBy: { updatedAt: "desc" },
              select: {
                id: true,
                orderNumber: true,
                companyName: true,
                status: true,
                priority: true,
                productKind: true,
                createdAt: true,
                updatedAt: true,
                currentDivision: { select: { id: true, name: true } },
                createdBy: { select: { id: true, name: true } },
              },
            });
          } catch {
            const rows = await prisma.order.findMany({
              take: 200,
              orderBy: { updatedAt: "desc" },
              select: {
                id: true,
                orderNumber: true,
                companyName: true,
                status: true,
                createdAt: true,
                updatedAt: true,
                currentDivision: { select: { id: true, name: true } },
                createdBy: { select: { id: true, name: true } },
              },
            });
            return rows.map((r) => ({ ...r, priority: "NORMAL", productKind: null as string | null }));
          }
        },
        [] as Array<{
          id: number;
          orderNumber: string;
          companyName: string | null;
          status: string;
          priority: string;
          productKind: string | null;
          createdAt: Date;
          updatedAt: Date;
          currentDivision: { id: number; name: string };
          createdBy: { id: number; name: string };
        }>
      ),
      safe("totalCustomers", () => prisma.order.groupBy({ by: ["companyName"], _count: { id: true } }).then((r) => r.length), 0),
      safe(
        "openCount",
        () => prisma.order.count({ where: { status: { in: ["PLACED", "IN_PROGRESS", "TRANSFERRED"] } } }),
        0
      ),
    ]);

    const divisions = await prisma.division.findMany({ select: { id: true, name: true } });
    const divisionMap = new Map(divisions.map((d) => [d.id, d.name]));
    const byDivisionTable = new Map<
      number,
      { divisionId: number; divisionName: string; placed: number; inProgress: number; completed: number; rejected: number; total: number }
    >();
    for (const row of byDivision) {
      const cur =
        byDivisionTable.get(row.currentDivisionId) ?? {
          divisionId: row.currentDivisionId,
          divisionName: divisionMap.get(row.currentDivisionId) ?? `Division #${row.currentDivisionId}`,
          placed: 0,
          inProgress: 0,
          completed: 0,
          rejected: 0,
          total: 0,
        };
      cur.total += row._count.id;
      if (row.status === "PLACED") cur.placed += row._count.id;
      if (row.status === "IN_PROGRESS") cur.inProgress += row._count.id;
      if (row.status === "COMPLETED") cur.completed += row._count.id;
      if (row.status === "REJECTED") cur.rejected += row._count.id;
      byDivisionTable.set(row.currentDivisionId, cur);
    }

    return NextResponse.json({
      statusCounts: Object.fromEntries(statusCounts.map((r) => [r.status, r._count.id])),
      totalCustomers,
      openCount,
      byDivision: Array.from(byDivisionTable.values()).sort((a, b) => b.total - a.total),
      recent: recent.map((o) => ({
        ...o,
        createdAt: o.createdAt.toISOString(),
        updatedAt: o.updatedAt.toISOString(),
      })),
    });
  } catch (err) {
    console.error("[GET /api/accounts/overview]", err);
    if (isDbUnavailableError(err)) return dbUnavailableJson();
    return NextResponse.json({ error: "Failed to load accounts overview" }, { status: 500 });
  }
}
