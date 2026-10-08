import { prisma } from "@/lib/db";
import { publish } from "@/lib/events";
import { registerEventHandlers } from "@/lib/event-handlers";

let handlersReady = false;
function ensureHandlers() {
  if (!handlersReady) {
    registerEventHandlers();
    handlersReady = true;
  }
}

type OrderSnap = { id: number; orderNumber: string; currentDivisionId: number };

/** One stage of one enquiry that has run past its deadline. */
type Candidate = { order: OrderSnap; breachType: string };

async function recordBreach(order: OrderSnap, breachType: string, now: Date): Promise<void> {
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
}

/** Collect a stage as a candidate when its deadline has passed (strict wall-clock). */
function consider(
  out: Candidate[],
  order: OrderSnap,
  breachType: string,
  deadline: Date | null,
  now: Date
): void {
  if (!deadline) return;
  if (new Date(deadline) >= now) return;
  out.push({ order, breachType });
}

/**
 * Detects and records SLA breaches across all workflow stages.
 *
 * Stages monitored:
 *   PLACEMENT            — order not accepted within 72 h of placement/transfer
 *   HANDOFF              — head did not assign supervisor within 72 h of acceptance
 *   HEAD_SAMPLE_APPROVAL — head did not approve sample request within 72 h of handoff
 *   SAMPLE_DETAILS       — supervisor did not submit sample details within 72 h
 *   SAMPLE_APPROVAL      — head did not approve sample within 72 h of details submitted
 *   SHIPMENT             — supervisor did not record shipment within 72 h of approval
 *
 * Deadlines are strict 72-hour wall-clock windows: the check runs around the
 * clock with no business-hours, weekend, or holiday gating.
 *
 * Existing breaches are looked up in a single query rather than one per
 * candidate stage. On the Neon pooler (one connection per instance) the old
 * per-candidate `findFirst` turned a handful of overdue enquiries into twenty
 * seconds of serialised round trips, which stalled every request behind it.
 */
export async function runSlaBreachCheck(): Promise<{
  breachesCreated: number;
  skipped?: boolean;
  reason?: string;
}> {
  ensureHandlers();
  const now = new Date();

  const base = { id: true, orderNumber: true, currentDivisionId: true } as const;
  const candidates: Candidate[] = [];

  // ── PLACEMENT: PLACED / TRANSFERRED orders past their 72h deadline ──────────
  const placement = await prisma.order.findMany({
    where: { status: { in: ["PLACED", "TRANSFERRED"] }, slaDeadline: { not: null, lt: now } },
    select: { ...base, slaDeadline: true },
  });
  for (const o of placement) {
    consider(candidates, o, "PLACEMENT", o.slaDeadline, now);
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
    consider(candidates, o, "HANDOFF",              o.handoffSlaDeadline,            now);
    consider(candidates, o, "HEAD_SAMPLE_APPROVAL", o.headSampleApprovalSlaDeadline, now);
    consider(candidates, o, "SAMPLE_DETAILS",       o.sampleDetailsSlaDeadline,      now);
    consider(candidates, o, "SAMPLE_APPROVAL",      o.sampleApprovalSlaDeadline,     now);
    consider(candidates, o, "SHIPMENT",             o.shipmentSlaDeadline,           now);
  }

  if (candidates.length === 0) return { breachesCreated: 0 };

  // One lookup for everything already recorded, instead of one per candidate.
  const orderIds = [...new Set(candidates.map((c) => c.order.id))];
  const existing = await prisma.sLABreach.findMany({
    where: { orderId: { in: orderIds }, resolvedAt: null },
    select: { orderId: true, breachType: true },
  });
  const alreadyRecorded = new Set(existing.map((e) => `${e.orderId}:${e.breachType}`));

  let total = 0;
  for (const c of candidates) {
    const key = `${c.order.id}:${c.breachType}`;
    if (alreadyRecorded.has(key)) continue;
    await recordBreach(c.order, c.breachType, now);
    // Guard against the same stage appearing twice in one run.
    alreadyRecorded.add(key);
    total++;
  }

  return { breachesCreated: total };
}

/**
 * Safety-net wrapper for read endpoints.
 *
 * Dashboards call this so breach counts stay fresh between cron runs, but a
 * dashboard must not pay for a full scan on every load. This runs the check at
 * most once every few minutes per server process; the nightly cron calls
 * `runSlaBreachCheck` directly and is never throttled.
 */
const THROTTLE_MS = 5 * 60_000;
let lastRunAt = 0;

export async function runSlaBreachCheckThrottled(): Promise<void> {
  const now = Date.now();
  if (now - lastRunAt < THROTTLE_MS) return;
  lastRunAt = now;
  try {
    await runSlaBreachCheck();
  } catch (err) {
    console.error("[sla-breach-job] throttled run failed:", err);
    // Allow the next caller to retry rather than waiting out the window.
    lastRunAt = 0;
  }
}
