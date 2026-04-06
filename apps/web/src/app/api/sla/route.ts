import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withRole } from "@/lib/with-auth";
import { runSlaBreachCheck } from "@/lib/sla-breach-job";

export async function GET(req: Request) {
  const auth = await withRole(["SUPER_ADMIN", "MANAGING_DIRECTOR"]);
  if (auth.response) return auth.response;

  await runSlaBreachCheck().catch((err) => {
    console.error("[api/sla] SLA breach sync failed:", err);
  });

  const { searchParams } = new URL(req.url);
  const divisionId = searchParams.get("divisionId");
  const where: { divisionId?: number } = {};
  if (divisionId) where.divisionId = Number(divisionId);
  const [breaches, ordersAtRisk] = await Promise.all([
    prisma.sLABreach.findMany({
      where,
      include: {
        order: { select: { id: true, orderNumber: true, status: true } },
        division: { select: { name: true } },
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
}
