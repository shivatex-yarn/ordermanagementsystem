import type { Prisma } from "@prisma/client";

const CATEGORIES = ["AUTH", "ENQUIRY", "TEAM", "DIVISION", "ORGANIZATION", "ACCESS"];

/** Builds the audit-log filter from query params (userId, category, from, to, q). Shared by the list and the Excel export. */
export function auditWhere(sp: URLSearchParams): Prisma.AuditLogWhereInput {
  const and: Prisma.AuditLogWhereInput[] = [];
  const userId = Number(sp.get("userId"));
  if (userId) and.push({ userId });
  const category = sp.get("category");
  if (category && CATEGORIES.includes(category)) and.push({ category });
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
  return and.length ? { AND: and } : {};
}
