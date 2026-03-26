import { prisma } from "@/lib/db";
import { subscribe } from "@/lib/events";
import type { OrderEvent } from "@/lib/events";
import { formatEnquiryNumber } from "@/lib/enquiry-display";
import { getNotificationShortLabel } from "@/lib/notification-labels";
import { sendEnquiryNotificationEmail } from "@/lib/email";
import { postEventToN8n } from "@/lib/n8n-webhook";

async function auditHandler(event: OrderEvent): Promise<void> {
  const action = event.type;
  const payload = { ...event };
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
  const title = `${formatEnquiryNumber(event.orderNumber)} · ${getNotificationShortLabel(event.type)}`;
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

export function eventTypeToSummary(type: string, event: OrderEvent): string {
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
    case "SampleDetailsUpdated":
      return `Sample details were updated for enquiry ${event.orderNumber}.`;
    case "SampleApproved":
      return `Sample was approved for enquiry ${event.orderNumber}.`;
    case "SampleShipped": {
      const e = event as Extract<OrderEvent, { type: "SampleShipped" }>;
      return `Sample was shipped for enquiry ${e.orderNumber} (${e.courierName}, tracking ${e.trackingId}).`;
    }
    case "SalesFeedbackRecorded":
      return `Sales feedback was submitted for enquiry ${event.orderNumber}.`;
    default:
      return `Enquiry ${event.orderNumber}: ${type}.`;
  }
}

async function n8nWebhookHandler(event: OrderEvent): Promise<void> {
  await postEventToN8n(event);
}

let registered = false;
export function registerEventHandlers(): void {
  if (registered) return;
  registered = true;
  subscribe(auditHandler);
  subscribe(notificationHandler);
  subscribe(n8nWebhookHandler);
}
