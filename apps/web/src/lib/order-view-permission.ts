import type { JWTPayload } from "@/lib/auth";
import { prisma } from "@/lib/db";

/** Minimal order fields needed for view authorization (matches GET /api/orders/[id] rules). */
export type OrderViewFields = {
  createdById: number;
  currentDivisionId: number;
  previousDivisionId: number | null;
};

export async function userCanViewOrder(payload: JWTPayload, order: OrderViewFields): Promise<boolean> {
  const userId = Number(payload.sub);
  if (Number.isNaN(userId)) return false;

  const { role } = payload;
  if (role === "MANAGING_DIRECTOR" || role === "SUPER_ADMIN" || role === "ACCOUNTS") return true;
  if (role === "USER") return order.createdById === userId;
  if (role === "MANAGER" || role === "SUPERVISOR") {
    if (order.createdById === userId) return true;
    const managed = await prisma.divisionManager.findMany({
      where: { userId },
      select: { divisionId: true },
    });
    /**
     * `payload.divisionId` may be missing for older sessions/tokens.
     * Fall back to the DB user's divisionId so division heads/supervisors
     * don't get incorrectly blocked with 403.
     */
    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { divisionId: true },
    });
    const accessible = new Set(
      [payload.divisionId ?? null, dbUser?.divisionId ?? null, ...managed.map((m) => m.divisionId)].filter(
        (v): v is number => typeof v === "number"
      )
    );
    return (
      accessible.has(order.currentDivisionId) ||
      (order.previousDivisionId != null && accessible.has(order.previousDivisionId))
    );
  }
  return false;
}

/** Narrow cached JSON to fields needed for permission (avoids trusting full shape). */
export function orderViewFieldsFromUnknown(cached: unknown): OrderViewFields | null {
  if (typeof cached !== "object" || cached === null) return null;
  const o = cached as Record<string, unknown>;
  const createdById = o.createdById;
  const currentDivisionId = o.currentDivisionId;
  const previousDivisionId = o.previousDivisionId;
  if (typeof createdById !== "number" || typeof currentDivisionId !== "number") return null;
  if (previousDivisionId != null && typeof previousDivisionId !== "number") return null;
  return {
    createdById,
    currentDivisionId,
    previousDivisionId: previousDivisionId ?? null,
  };
}
