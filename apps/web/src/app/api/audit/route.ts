import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { withRole } from "@/lib/with-auth";

const PAGE_SIZE = 20;

/** Super admin: every recorded action. Filters: userId, category, from, to, q. Paged by 20. */
export async function GET(req: Request) {
  const auth = await withRole(["SUPER_ADMIN"]);
  if (auth.response) return auth.response;
  const sp = new URL(req.url).searchParams;
  const where: Prisma.AuditLogWhereInput = {};
  const and: Prisma.AuditLogWhereInput[] = [];

  const userId = Number(sp.get("userId"));
  if (userId) and.push({ userId });
  const category = sp.get("category");
  if (category && ["AUTH", "ENQUIRY", "TEAM", "DIVISION", "ACCESS"].includes(category)) and.push({ category });
  const from = sp.get("from");
  const to = sp.get("to");
  const range: Prisma.DateTimeFilter = {};
  if (from && !Number.isNaN(new Date(from).getTime())) range.gte = new Date(`${from}T00:00:00+05:30`);
  if (to && !Number.isNaN(new Date(to).getTime())) range.lte = new Date(`${to}T23:59:59.999+05:30`);
  if (range.gte || range.lte) and.push({ createdAt: range });
  const q = sp.get("q")?.trim();
  if (q) {
    and.push({
      OR: [
        { userName: { contains: q, mode: "insensitive" } },
        { action: { contains: q, mode: "insensitive" } },
        { entityLabel: { contains: q, mode: "insensitive" } },
        { detail: { contains: q, mode: "insensitive" } },
        { ipAddress: { contains: q } },
      ],
    });
  }
  if (and.length) where.AND = and;

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
