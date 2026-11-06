import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withRole } from "@/lib/with-auth";
import { orderListSelect } from "@/lib/orders";

/** Read-only roll-up for Managing director, Accounts and Super admin. */
export async function GET() {
  const auth = await withRole(["MANAGING_DIRECTOR", "ACCOUNTS", "SUPER_ADMIN"]);
  if (auth.response) return auth.response;
  const [byStatus, byDivision, divisions, recent, feedback, samples] = await Promise.all([
    prisma.order.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.order.groupBy({ by: ["divisionId"], _count: { _all: true } }),
    prisma.division.findMany({ select: { id: true, name: true } }),
    prisma.order.findMany({ orderBy: { enquiryDate: "desc" }, take: 8, select: orderListSelect }),
    prisma.order.findMany({
      where: { clientFeedback: { not: null } },
      orderBy: { clientFeedbackAt: "desc" },
      take: 6,
      select: { id: true, orderNumber: true, customerName: true, companyName: true, clientFeedback: true, clientResponse: true, clientFeedbackAt: true, division: { select: { name: true } } },
    }),
    prisma.order.count({ where: { isSample: true } }),
  ]);
  const names = new Map(divisions.map((d) => [d.id, d.name]));
  return NextResponse.json({
    byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])),
    byDivision: byDivision.map((d) => ({ name: names.get(d.divisionId) ?? "Unknown", count: d._count._all })).sort((a, b) => b.count - a.count),
    samples,
    recent,
    feedback,
  });
}
