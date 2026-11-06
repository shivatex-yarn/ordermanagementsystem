import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { computeAnalytics } from "@/lib/analytics";
import { orderListSelect, scopeWhere } from "@/lib/orders";

/** Dashboard numbers for the signed-in person, limited to the divisions they can access. */
export async function GET(req: Request) {
  const auth = await withAuth();
  if (auth.response) return auth.response;
  const me = Number(auth.payload.sub);
  const scope = await scopeWhere(auth.payload);

  const sp = new URL(req.url).searchParams;
  const [byStatus, byDivision, divisions, recent, mine, samplesToSend, needsPricing] = await Promise.all([
    prisma.order.groupBy({ by: ["status"], where: scope, _count: { _all: true } }),
    prisma.order.groupBy({ by: ["divisionId"], where: scope, _count: { _all: true } }),
    prisma.division.findMany({ select: { id: true, name: true } }),
    prisma.order.findMany({ where: scope, orderBy: { enquiryDate: "desc" }, take: 6, select: orderListSelect }),
    prisma.order.count({ where: { ...scope, createdById: me } }),
    prisma.order.count({ where: { ...scope, isSample: true, sampleSentAt: null, status: { in: ["PLACED", "PRICED"] } } }),
    prisma.order.findMany({ where: { ...scope, status: "PLACED" }, orderBy: { enquiryDate: "asc" }, take: 5, select: orderListSelect }),
  ]);
  const names = new Map(divisions.map((d) => [d.id, d.name]));
  return NextResponse.json({
    byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])),
    byDivision: byDivision.map((d) => ({ name: names.get(d.divisionId) ?? "Unknown", count: d._count._all })).sort((a, b) => b.count - a.count),
    mine,
    samplesToSend,
    recent,
    needsPricing,
    analytics: await computeAnalytics(scope, { days: Number(sp.get("days")) || 30, divisionId: Number(sp.get("divisionId")) || undefined, from: sp.get("from") || undefined, to: sp.get("to") || undefined }),
  });
}
