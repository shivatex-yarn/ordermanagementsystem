import { NextResponse } from "next/server";
import { auditWhere } from "@/lib/audit-filter";
import { prisma } from "@/lib/db";
import { withRole } from "@/lib/with-auth";

const PAGE_SIZE = 20;

/** Super admin: every recorded action. Filters: userId, category, from, to, q. Paged by 20. */
export async function GET(req: Request) {
  const auth = await withRole(["SUPER_ADMIN"]);
  if (auth.response) return auth.response;
  const sp = new URL(req.url).searchParams;
  const where = auditWhere(sp);

  const page = Math.max(1, Number(sp.get("page")) || 1);
  const [logs, total, people] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    prisma.auditLog.count({ where }),
    // Filter dropdown: one entry per person (grouped by account, not by the name recorded at the time)
    prisma.auditLog.groupBy({ by: ["userId"], where: { userId: { not: null } }, _count: { _all: true } }),
  ]);
  const names = await prisma.user.findMany({ where: { id: { in: people.map((p) => p.userId as number) } }, select: { id: true, name: true } });
  const nameOf = new Map(names.map((u) => [u.id, u.name]));
  return NextResponse.json({
    logs, total, page, pageSize: PAGE_SIZE,
    people: people
      .map((p) => ({ id: p.userId as number, name: nameOf.get(p.userId as number) ?? "Former team member", count: p._count._all }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  });
}
