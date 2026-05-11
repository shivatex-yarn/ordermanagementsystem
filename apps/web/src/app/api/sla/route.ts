import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { runSlaBreachCheck } from "@/lib/sla-breach-job";
import { dbUnavailableJson, isDbUnavailableError } from "@/lib/db-errors";

const SLA_ROLES = new Set(["SUPER_ADMIN", "MANAGING_DIRECTOR"]);

export async function GET(req: Request) {
  const auth = await withAuth();
  if (auth.response) return auth.response;

  /** Use DB role so this matches `/api/auth/me` and the dashboard (JWT can lag after promotion/demotion). */
  const userId = Number(auth.payload.sub);
  let effectiveRole = auth.payload.role;
  if (Number.isInteger(userId) && userId >= 1) {
    const row = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (row) effectiveRole = row.role;
  }
  if (!SLA_ROLES.has(effectiveRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  /** Fast path for metrics (dashboard): skip sync job + avoid loading up to 100 breach rows. */
  const summaryOnly = searchParams.get("summary") === "1";

  try {
    if (!summaryOnly) {
      await runSlaBreachCheck().catch((err) => {
        console.error("[api/sla] SLA breach sync failed:", err);
      });
    }

    const divisionIdRaw = searchParams.get("divisionId");
    const where: Prisma.SLABreachWhereInput = {};
    if (divisionIdRaw) {
      const divisionId = Number(divisionIdRaw);
      if (Number.isFinite(divisionId)) where.divisionId = divisionId;
    }

    if (summaryOnly) {
      const now = new Date();
      const [breachCount, atRiskCount] = await Promise.all([
        prisma.sLABreach.count({ where }),
        prisma.order.count({
          where: {
            status: { in: ["PLACED", "TRANSFERRED"] },
            slaDeadline: { lt: now },
          },
        }),
      ]);
      return NextResponse.json({
        summary: true,
        breachCount,
        atRiskCount,
      });
    }

    const [breaches, ordersAtRisk] = await Promise.all([
      prisma.sLABreach.findMany({
        where,
        include: {
          order: { select: { id: true, orderNumber: true, status: true } },
          division: { select: { name: true } },
          headRejectedBy: { select: { id: true, name: true, email: true } },
        },
        orderBy: { breachedAt: "desc" },
        take: 100,
      }),
      prisma.order.findMany({
        where: {
          status: { in: ["PLACED", "TRANSFERRED"] },
          slaDeadline: { lt: new Date() },
        },
        select: { id: true, orderNumber: true, currentDivisionId: true, slaDeadline: true },
        take: 50,
      }),
    ]);

    return NextResponse.json({ breaches, ordersAtRisk });
  } catch (err) {
    console.error("[api/sla] GET failed:", err);
    if (isDbUnavailableError(err)) return dbUnavailableJson();
    return NextResponse.json({ error: "SLA endpoint failed." }, { status: 500 });
  }
}
