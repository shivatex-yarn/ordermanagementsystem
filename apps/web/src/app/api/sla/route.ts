import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withRole } from "@/lib/with-auth";

export async function GET(req: Request) {
  const auth = await withRole(["SUPER_ADMIN", "MANAGER"]);
  if (auth.response) return auth.response;
  const { searchParams } = new URL(req.url);
  const divisionId = searchParams.get("divisionId");
  const where: { divisionId?: number } = {};
  if (divisionId) where.divisionId = Number(divisionId);
  if (auth.payload.role === "MANAGER" && auth.payload.divisionId) {
    where.divisionId = auth.payload.divisionId;
  }
  const [breaches, ordersAtRisk] = await Promise.all([
    prisma.sLABreach.findMany({
      where,
      include: { order: { select: { orderNumber: true, status: true } }, division: { select: { name: true } } },
      orderBy: { breachedAt: "desc" },
      take: 100,
    }),
    prisma.order.findMany({
      where: {
        status: { in: ["PLACED", "TRANSFERRED"] },
        slaDeadline: { lt: new Date() },
        ...(auth.payload.role === "MANAGER" && auth.payload.divisionId
          ? { currentDivisionId: auth.payload.divisionId }
          : {}),
      },
      select: { id: true, orderNumber: true, currentDivisionId: true, slaDeadline: true },
      take: 50,
    }),
  ]);
  return NextResponse.json({ breaches, ordersAtRisk });
}
