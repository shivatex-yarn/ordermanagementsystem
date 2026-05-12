/**
 * SLA delay-reason gate.
 *
 * Spec: "If a Division Head logs into the system after an SLA breach: they must submit
 * the reason for delay before accessing any other modules or actions. Until the reason
 * is submitted, access to other screens/features should remain restricted."
 *
 * Implementation: we record a `SLADelayReason` row per submission and denormalise the
 * latest snapshot onto `SLABreach.delayReasonText` / `delayReasonAt`. A breach is
 * considered "explained" once `delayReasonAt` is set. A breach is "open" until
 * `resolvedAt` is set (typically when the enquiry transitions out of PLACED/TRANSFERRED).
 *
 * The login-time gate is implemented in `src/components/sla-gate.tsx` (client) by
 * calling `GET /api/sla/gate` which returns the list of breaches still requiring a
 * delay reason from the current user. Until that list is empty, the gate component
 * mounts an overlay locking the rest of the app.
 */

import { prisma } from "@/lib/db";
import { appendTimeline } from "@/lib/timeline";
import { isDivisionHead } from "@/lib/roles";
import type { Role } from "@prisma/client";

/** Divisions the user manages (DivisionManager join) plus their direct divisionId. */
export async function getUserDivisionIds(userId: number, divisionId?: number | null): Promise<number[]> {
  const managed = await prisma.divisionManager.findMany({
    where: { userId },
    select: { divisionId: true },
  });
  const set = new Set<number>(managed.map((m) => m.divisionId));
  if (typeof divisionId === "number") set.add(divisionId);
  // Fallback: read user row's divisionId in case JWT didn't carry it.
  if (set.size === 0) {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { divisionId: true } });
    if (u?.divisionId) set.add(u.divisionId);
  }
  return Array.from(set);
}

/**
 * Breaches that the Division Head must explain (delay-reason) before they can use the app.
 * Returns an empty array unless the user is a division head/manager AND has open, unexplained
 * breaches in any of their divisions.
 */
export async function pendingDelayReasonBreaches(userId: number, role: Role | null | undefined, divisionId?: number | null) {
  if (!isDivisionHead(role)) return [];
  const divisionIds = await getUserDivisionIds(userId, divisionId);
  if (divisionIds.length === 0) return [];
  return prisma.sLABreach.findMany({
    where: {
      divisionId: { in: divisionIds },
      resolvedAt: null,
      delayReasonAt: null,
    },
    orderBy: { breachedAt: "asc" },
    select: {
      id: true,
      orderId: true,
      breachedAt: true,
      headRejectedAt: true,
      headRejectionMessage: true,
      division: { select: { id: true, name: true } },
      order: {
        select: {
          id: true,
          orderNumber: true,
          companyName: true,
          createdAt: true,
          status: true,
          priority: true,
        },
      },
    },
  });
}

/**
 * Record a delay reason submission. The user must be a division head/manager assigned
 * to the breach's division (or admin/MD bypass).
 */
export async function submitDelayReason(
  breachId: number,
  userId: number,
  role: Role,
  reasonText: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const trimmed = reasonText.trim();
  if (trimmed.length < 10) return { ok: false, reason: "Reason must be at least 10 characters" };

  const breach = await prisma.sLABreach.findUnique({
    where: { id: breachId },
    select: { id: true, divisionId: true, orderId: true, resolvedAt: true },
  });
  if (!breach) return { ok: false, reason: "Breach not found" };
  if (breach.resolvedAt) return { ok: false, reason: "Breach already resolved" };

  const bypass = role === "SUPER_ADMIN" || role === "MANAGING_DIRECTOR";
  if (!bypass) {
    if (!isDivisionHead(role)) return { ok: false, reason: "Only Division Head can submit delay reason" };
    const ok = await prisma.divisionManager.findFirst({
      where: { userId, divisionId: breach.divisionId },
      select: { id: true },
    });
    if (!ok) return { ok: false, reason: "You do not manage this division" };
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.sLADelayReason.create({
      data: { breachId, userId, reasonText: trimmed },
    }),
    prisma.sLABreach.update({
      where: { id: breachId },
      data: { delayReasonText: trimmed, delayReasonAt: now },
    }),
  ]);

  await appendTimeline({
    orderId: breach.orderId,
    type: "DELAY_REASON_SUBMITTED",
    title: "Division Head submitted SLA delay reason",
    detail: trimmed,
    actorId: userId,
    metadata: { breachId },
  });

  return { ok: true };
}

/**
 * MD breakdown: open + explained breaches grouped by division.
 * Fast path — selects only the columns needed for the rollup, no order/division
 * deep joins. We resolve division names in a separate cheap lookup.
 */
export async function divisionSlaBreakdown() {
  const rows = await prisma.sLABreach.findMany({
    where: { resolvedAt: null },
    select: { divisionId: true, breachedAt: true, delayReasonAt: true },
  });
  if (rows.length === 0) return { breakdown: [], breaches: [] as Array<unknown> };

  const divisionIds = Array.from(new Set(rows.map((r) => r.divisionId)));
  const divisions = await prisma.division.findMany({
    where: { id: { in: divisionIds } },
    select: { id: true, name: true },
  });
  const nameById = new Map(divisions.map((d) => [d.id, d.name]));

  const byDivision = new Map<
    number,
    {
      divisionId: number;
      divisionName: string;
      total: number;
      explained: number;
      pending: number;
      oldestBreachAt: Date | null;
    }
  >();
  for (const b of rows) {
    const cur =
      byDivision.get(b.divisionId) ?? {
        divisionId: b.divisionId,
        divisionName: nameById.get(b.divisionId) ?? `Division #${b.divisionId}`,
        total: 0,
        explained: 0,
        pending: 0,
        oldestBreachAt: null,
      };
    cur.total += 1;
    if (b.delayReasonAt) cur.explained += 1;
    else cur.pending += 1;
    if (!cur.oldestBreachAt || b.breachedAt < cur.oldestBreachAt) cur.oldestBreachAt = b.breachedAt;
    byDivision.set(b.divisionId, cur);
  }
  return { breakdown: Array.from(byDivision.values()), breaches: [] as Array<unknown> };
}
