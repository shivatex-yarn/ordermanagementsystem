import { prisma } from "@/lib/db";
import { publish } from "@/lib/events";
import { registerEventHandlers } from "@/lib/event-handlers";
import { advancePastNonWorkingDay, isWithinSlaBusinessHours } from "@/lib/sla-calendar";

let handlersReady = false;
function ensureHandlers() {
  if (!handlersReady) {
    registerEventHandlers();
    handlersReady = true;
  }
}

function adjustDeadline(deadline: Date): Date {
  return advancePastNonWorkingDay(deadline);
}

type OrderSnap = { id: number; orderNumber: string; currentDivisionId: number };

async function createBreachIfNew(order: OrderSnap, breachType: string, deadline: Date, now: Date): Promise<boolean> {
  const effective = adjustDeadline(new Date(deadline));
  if (effective >= now) return false;

  const existing = await prisma.sLABreach.findFirst({
    where: { orderId: order.id, breachType, resolvedAt: null },
    select: { id: true },
  });
  if (existing) return false;

  await prisma.sLABreach.create({
    data: { orderId: order.id, divisionId: order.currentDivisionId, breachType },
  });
  await publish({
    type: "SLABreachDetected",
    orderId: order.id,
    orderNumber: order.orderNumber,
    divisionId: order.currentDivisionId,
    breachType,
    timestamp: now.toISOString(),
  });
  return true;
}

/**
 * Detects and records SLA breaches across all workflow stages.
 *
 * Stages monitored:
 *   PLACEMENT            — order not accepted within 48 h of placement/transfer
 *   HANDOFF              — head did not assign supervisor within 24 h of acceptance
 *   HEAD_SAMPLE_APPROVAL — head did not approve sample request within 24 h of handoff
 *   SAMPLE_DETAILS       — supervisor did not submit sample details within 48 h
 *   SAMPLE_APPROVAL      — head did not approve sample within 24 h of details submitted
 *   SHIPMENT             — supervisor did not record shipment within 48 h of approval
 *
 * Only runs during SLA business hours: Monday–Saturday, 10:00 AM–6:00 PM IST,
 * excluding South Indian public holidays.
 */
export async function runSlaBreachCheck(): Promise<{
  breachesCreated: number;
  skipped?: boolean;
  reason?: string;
}> {
  ensureHandlers();
  const now = new Date();

  if (!isWithinSlaBusinessHours(now)) {
    return { breachesCreated: 0, skipped: true, reason: "outside business hours" };
  }

  let total = 0;
  const base = { id: true, orderNumber: true, currentDivisionId: true } as const;

  // ── PLACEMENT: PLACED / TRANSFERRED orders past their 48h deadline ──────────
  const placement = await prisma.order.findMany({
    where: { status: { in: ["PLACED", "TRANSFERRED"] }, slaDeadline: { not: null, lt: now } },
    select: { ...base, slaDeadline: true },
  });
  for (const o of placement) {
    if (o.slaDeadline && await createBreachIfNew(o, "PLACEMENT", o.slaDeadline, now)) total++;
  }

  // ── IN_PROGRESS stage deadlines ─────────────────────────────────────────────
  const inProgress = await prisma.order.findMany({
    where: {
      status: "IN_PROGRESS",
      OR: [
        { handoffSlaDeadline:            { not: null, lt: now } },
        { headSampleApprovalSlaDeadline: { not: null, lt: now } },
        { sampleDetailsSlaDeadline:      { not: null, lt: now } },
        { sampleApprovalSlaDeadline:     { not: null, lt: now } },
        { shipmentSlaDeadline:           { not: null, lt: now } },
      ],
    },
    select: {
      ...base,
      handoffSlaDeadline:            true,
      headSampleApprovalSlaDeadline: true,
      sampleDetailsSlaDeadline:      true,
      sampleApprovalSlaDeadline:     true,
      shipmentSlaDeadline:           true,
    },
  });

  for (const o of inProgress) {
    if (o.handoffSlaDeadline            && await createBreachIfNew(o, "HANDOFF",              o.handoffSlaDeadline,            now)) total++;
    if (o.headSampleApprovalSlaDeadline && await createBreachIfNew(o, "HEAD_SAMPLE_APPROVAL", o.headSampleApprovalSlaDeadline, now)) total++;
    if (o.sampleDetailsSlaDeadline      && await createBreachIfNew(o, "SAMPLE_DETAILS",       o.sampleDetailsSlaDeadline,      now)) total++;
    if (o.sampleApprovalSlaDeadline     && await createBreachIfNew(o, "SAMPLE_APPROVAL",      o.sampleApprovalSlaDeadline,     now)) total++;
    if (o.shipmentSlaDeadline           && await createBreachIfNew(o, "SHIPMENT",             o.shipmentSlaDeadline,           now)) total++;
  }

  return { breachesCreated: total };
}
