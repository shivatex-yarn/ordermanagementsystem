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

/**
 * If the stored slaDeadline falls on a non-working day (Sunday or Indian holiday),
 * advance it to the next working day at the same time.
 * This is a safety net for deadlines set before the holiday-aware logic was deployed.
 */
function adjustDeadlineForNonWorkingDay(deadline: Date): Date {
  return advancePastNonWorkingDay(deadline);
}

/**
 * Detects and records SLA breaches for enquiries in PLACED / TRANSFERRED status
 * whose slaDeadline has passed.
 *
 * Only runs during SLA business hours: Monday–Saturday, 10:00 AM–6:00 PM IST,
 * excluding Indian public holidays.
 */
export async function runSlaBreachCheck(): Promise<{
  breachesCreated: number;
  skipped?: boolean;
  reason?: string;
}> {
  ensureHandlers();
  const now = new Date();

  // Skip entirely outside business hours (Mon–Sat, 10:00–18:00 IST, non-holiday).
  if (!isWithinSlaBusinessHours(now)) {
    return { breachesCreated: 0, skipped: true, reason: "outside business hours" };
  }

  const orders = await prisma.order.findMany({
    where: {
      status: { in: ["PLACED", "TRANSFERRED"] },
      slaDeadline: { lt: now },
    },
    select: {
      id: true,
      orderNumber: true,
      currentDivisionId: true,
      slaDeadline: true,
    },
  });

  let breachesCreated = 0;
  for (const order of orders) {
    if (!order.slaDeadline) continue;

    // Re-check against the holiday-adjusted effective deadline.
    const effectiveDeadline = adjustDeadlineForNonWorkingDay(new Date(order.slaDeadline));
    if (effectiveDeadline >= now) continue;

    // Skip if a breach record already exists and is unresolved.
    const existing = await prisma.sLABreach.findFirst({
      where: { orderId: order.id, resolvedAt: null },
    });
    if (existing) continue;

    await prisma.sLABreach.create({
      data: { orderId: order.id, divisionId: order.currentDivisionId },
    });
    breachesCreated += 1;

    await publish({
      type: "SLABreachDetected",
      orderId: order.id,
      orderNumber: order.orderNumber,
      divisionId: order.currentDivisionId,
      timestamp: new Date().toISOString(),
    });
  }

  return { breachesCreated };
}
