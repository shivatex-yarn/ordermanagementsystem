import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { accessibleDivisionIds } from "@/lib/with-auth";
import type { Role } from "@prisma/client";

export const orderListSelect = {
  id: true,
  orderNumber: true,
  status: true,
  enquiryDate: true,
  customerName: true,
  companyName: true,
  isSample: true,
  sampleSentAt: true,
  pricePerUnit: true,
  priceUnit: true,
  clientResponse: true,
  createdAt: true,
  division: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  assignedTo: { select: { id: true, name: true } },
} satisfies Prisma.OrderSelect;

/**
 * Build the `where` fragment that limits enquiries to what a person may see:
 * the divisions they can access and, for Marketing, only the enquiries they logged (or were assigned),
 * so one Marketing person never sees another's.
 */
export async function scopeWhere(payload: { sub: string; role: Role }): Promise<Prisma.OrderWhereInput> {
  const ids = await accessibleDivisionIds(payload);
  const where: Prisma.OrderWhereInput = ids === null ? {} : { divisionId: { in: ids } };
  if (payload.role === "MARKETING") {
    const me = Number(payload.sub);
    where.OR = [{ createdById: me }, { assignedToId: me }];
  }
  return where;
}

export function newOrderNumber(id: number): string {
  return `ENQ-${String(id).padStart(4, "0")}`;
}

/** Create with a throw-away number, then set the readable one from the row id (unique, no races). */
export async function createOrderRow(data: Omit<Prisma.OrderUncheckedCreateInput, "orderNumber">) {
  return prisma.$transaction(async (tx) => {
    const row = await tx.order.create({ data: { ...data, orderNumber: `tmp-${randomUUID()}` } });
    return tx.order.update({ where: { id: row.id }, data: { orderNumber: newOrderNumber(row.id) } });
  });
}

/** Loads an order only if the caller is allowed to see it. */
export async function getScopedOrder(id: number, payload: { sub: string; role: Role }) {
  const scope = await scopeWhere(payload);
  return prisma.order.findFirst({ where: { id, ...scope } });
}
