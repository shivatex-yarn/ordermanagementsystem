import { prisma } from "@/lib/db";
import { subscribe } from "@/lib/events";
import type { OrderEvent } from "@/lib/events";
import { sendEnquiryNotificationEmail } from "@/lib/email";

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
  const title = `Enquiry ${event.orderNumber}: ${event.type}`;
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
  if (event.type === "SLABreachDetected") {
    const mds = await prisma.user.findMany({
      where: { role: "MANAGING_DIRECTOR", active: true },
      select: { id: true },
    });
    mds.forEach((u) => userIds.add(u.id));
  }
  const users = await prisma.user.findMany({
    where: { id: { in: [...userIds] } },
    select: { id: true, name: true, email: true },
  });
  for (const userId of userIds) {
    await prisma.notification.create({
      data: { userId, type: event.type, title, body, metadata: event as object },
    });
  }
  // Send email via Resend (fire-and-forget)
  const summary = eventTypeToSummary(event.type, event);
  for (const u of users) {
    sendEnquiryNotificationEmail(u.email, u.name, event.orderNumber, event.type, summary).catch((err) =>
      console.error("[email] Notification email failed for", u.email, err)
    );
  }
}

function eventTypeToSummary(type: string, event: OrderEvent): string {
  switch (type) {
    case "OrderCreated":
      return `A new enquiry ${event.orderNumber} was created and assigned to a division.`;
    case "OrderAccepted":
      return `Enquiry ${event.orderNumber} was accepted and is in progress.`;
    case "OrderTransferred":
      return `Enquiry ${event.orderNumber} was transferred to another division.`;
    case "OrderRejected":
      return `Enquiry ${event.orderNumber} was rejected.`;
    case "OrderReceived":
      return `Enquiry ${event.orderNumber} was received by the new division.`;
    case "OrderCompleted":
      return `Enquiry ${event.orderNumber} has been completed.`;
    case "SLABreachDetected":
      return `Enquiry ${event.orderNumber} has breached the 48-hour SLA.`;
    default:
      return `Enquiry ${event.orderNumber}: ${type}.`;
  }
}

let registered = false;
export function registerEventHandlers(): void {
  if (registered) return;
  registered = true;
  subscribe(auditHandler);
  subscribe(notificationHandler);
}
