import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

/**
 * Which enquiries a signed-in person is allowed to see.
 *
 * This is the single definition of enquiry visibility. `/api/orders` and the
 * dashboard aggregates both call it, so a list and the numbers above it can
 * never disagree about what the user can see.
 *
 *   ACCOUNTS                                  → everything (commercial rollup)
 *   SUPER_ADMIN, MANAGING_DIRECTOR            → everything
 *   MANAGER, DIVISION_HEAD, SUPERVISOR, ASM   → their division(s), including
 *                                               any granted by multi-division access
 *   USER (salesperson)                        → only enquiries they submitted
 */
export async function buildOrderScope(payload: {
  sub: string | number;
  role: string;
  divisionId?: number | null;
}): Promise<Prisma.OrderWhereInput> {
  const role = payload.role;
  if (role === "ACCOUNTS" || role === "SUPER_ADMIN" || role === "MANAGING_DIRECTOR") {
    return {};
  }

  if (role === "USER") {
    return { createdById: Number(payload.sub) };
  }

  if (role === "MANAGER" || role === "DIVISION_HEAD" || role === "SUPERVISOR" || role === "ASM") {
    const divisionIds = await accessibleDivisionIds(payload);
    // No division at all means no enquiries — never "all of them".
    if (divisionIds.length === 0) return { currentDivisionId: -1 };
    return { currentDivisionId: { in: divisionIds } };
  }

  return { currentDivisionId: -1 };
}

/** Division ids a person can act in: their own plus any granted via multi-division access. */
export async function accessibleDivisionIds(payload: {
  sub: string | number;
  divisionId?: number | null;
}): Promise<number[]> {
  const managed = await prisma.divisionManager.findMany({
    where: { userId: Number(payload.sub) },
    select: { divisionId: true },
  });
  return Array.from(
    new Set(
      [payload.divisionId ?? null, ...managed.map((m) => m.divisionId)].filter(
        (v): v is number => typeof v === "number"
      )
    )
  );
}
