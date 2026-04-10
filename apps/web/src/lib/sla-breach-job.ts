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

/**
 * Records SLA breaches for enquiries in PLACED/TRANSFERRED past slaDeadline,
 * publishes SLABreachDetected (notifications + email via event handlers).
 */
function adjustDeadlineForSunday(deadline: Date): Date {
  // SLA does not breach on Sundays; if a deadline lands on Sunday, push to Monday same time.
  if (deadline.getDay() !== 0) return deadline;
  const d = new Date(deadline);
  d.setDate(d.getDate() + 1);
  return d;
}

export async function runSlaBreachCheck(): Promise<{ breachesCreated: number; skipped?: boolean; reason?: string }> {
  ensureHandlers();
  const now = new Date();
  if (now.getDay() === 0) {
    return { breachesCreated: 0, skipped: true, reason: "Sunday" };
  }
  const orders = await prisma.order.findMany({
    where: {
      status: { in: ["PLACED", "TRANSFERRED"] },
      slaDeadline: { lt: now },
    },
    select: { id: true, orderNumber: true, currentDivisionId: true, slaDeadline: true },
  });
  let breachesCreated = 0;
  for (const order of orders) {
    if (!order.slaDeadline) continue;
    const effectiveDeadline = adjustDeadlineForSunday(new Date(order.slaDeadline));
    if (effectiveDeadline >= now) continue;

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
