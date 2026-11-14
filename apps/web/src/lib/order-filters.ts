import type { Prisma, Role } from "@prisma/client";
import { scopeWhere } from "@/lib/orders";

/**
 * Turns the enquiry list filters (status, divisionId, organizationId, from, to, q, mine) into Prisma `where` clauses.
 * `base` ignores status (used for tab counts); `where` includes it. Always limited to the divisions the person can see.
 */
export async function buildOrderWhere(sp: URLSearchParams, payload: { sub: string; role: Role }) {
  const scope = await scopeWhere(payload);
  const base: Prisma.OrderWhereInput = { ...scope };
  const and: Prisma.OrderWhereInput[] = [];

  const divisionId = Number(sp.get("divisionId"));
  if (divisionId) and.push({ divisionId });

  const organizationId = Number(sp.get("organizationId"));
  if (organizationId) and.push({ createdBy: { organizationId } });

  const from = sp.get("from");
  const to = sp.get("to");
  const range: Prisma.DateTimeFilter = {};
  if (from && !Number.isNaN(new Date(from).getTime())) range.gte = new Date(`${from}T00:00:00+05:30`);
  if (to && !Number.isNaN(new Date(to).getTime())) range.lte = new Date(`${to}T23:59:59.999+05:30`);
  if (range.gte || range.lte) and.push({ enquiryDate: range });

  if (sp.get("mine") === "1") {
    const me = Number(payload.sub);
    and.push({ OR: [{ createdById: me }, { assignedToId: me }] });
  }
  const q = sp.get("q")?.trim();
  if (q) {
    and.push({
      OR: [
        { customerName: { contains: q, mode: "insensitive" } },
        { companyName: { contains: q, mode: "insensitive" } },
        { orderNumber: { contains: q, mode: "insensitive" } },
        { productDetails: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  if (and.length) base.AND = and;

  const where: Prisma.OrderWhereInput = { ...base };
  const status = sp.get("status");
  if (status && ["PLACED", "PRICED", "CLOSED", "CANCELLED"].includes(status)) where.status = status as never;
  return { base, where };
}
