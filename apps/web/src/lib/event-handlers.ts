import { prisma } from "@/lib/db";
import { subscribe } from "@/lib/events";
import type { OrderEvent } from "@/lib/events";

async function auditHandler(event: OrderEvent): Promise<void> {
  const action = event.type;
  const payload = {
    orderId: event.orderId,
    orderNumber: event.orderNumber,
    ...event,
  };
  await prisma.auditLog.create({
    data: {
      orderId: event.orderId,
      action,
      payload: payload as object,
      userId: event.userId ?? undefined,
    },
  });
}

async function notificationHandler(event: OrderEvent): Promise<void> {
  const title = `Order ${event.orderNumber}: ${event.type}`;
  const body = JSON.stringify(event);
  // Notify relevant users (e.g. division managers, super admin for SLA)
  const order = await prisma.order.findUnique({
    where: { id: event.orderId },
    select: { currentDivisionId: true, createdById: true },
  });
  if (!order) return;
  const userIds = new Set<number>([order.createdById]);
  const managers = await prisma.divisionManager.findMany({
    where: { divisionId: order.currentDivisionId },
    select: { userId: true },
  });
  managers.forEach((m) => userIds.add(m.userId));
  const superAdmins = await prisma.user.findMany({
    where: { role: "SUPER_ADMIN" },
    select: { id: true },
  });
  superAdmins.forEach((u) => userIds.add(u.id));
  for (const userId of userIds) {
    await prisma.notification.create({
      data: { userId, type: event.type, title, body, metadata: event as object },
    });
  }
}

let registered = false;
export function registerEventHandlers(): void {
  if (registered) return;
  registered = true;
  subscribe(auditHandler);
  subscribe(notificationHandler);
}
