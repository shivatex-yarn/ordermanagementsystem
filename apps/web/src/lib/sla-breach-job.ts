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
export async function runSlaBreachCheck(): Promise<{ breachesCreated: number }> {
  ensureHandlers();
  const now = new Date();
  const orders = await prisma.order.findMany({
    where: {
      status: { in: ["PLACED", "TRANSFERRED"] },
      slaDeadline: { lt: now },
    },
    select: { id: true, orderNumber: true, currentDivisionId: true },
  });
  let breachesCreated = 0;
  for (const order of orders) {
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
