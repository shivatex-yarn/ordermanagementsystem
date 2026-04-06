import { prisma } from "@/lib/db";
import { subscribe } from "@/lib/events";
import type { OrderEvent } from "@/lib/events";
import { formatEnquiryNumber } from "@/lib/enquiry-display";
import { getNotificationShortLabel } from "@/lib/notification-labels";
import { sendEnquiryNotificationEmail, sendSlaBreachDetailEmail } from "@/lib/email";
import { postEventToN8n } from "@/lib/n8n-webhook";

const MAX_TRANSFER_REASON_EMAIL = 500;

async function handleSlaBreachNotification(
  event: Extract<OrderEvent, { type: "SLABreachDetected" }>,
  title: string,
  body: string
): Promise<void> {
  const exists = await prisma.order.findUnique({
    where: { id: event.orderId },
    select: { id: true },
  });
  if (!exists) return;

  const userIds = new Set<number>();
  const superAdmins = await prisma.user.findMany({
    where: { role: "SUPER_ADMIN" },
    select: { id: true },
  });
  superAdmins.forEach((u) => userIds.add(u.id));
  const mds = await prisma.user.findMany({
    where: { role: "MANAGING_DIRECTOR", active: true },
    select: { id: true },
  });
  mds.forEach((u) => userIds.add(u.id));

  const users = await prisma.user.findMany({
    where: { id: { in: [...userIds] } },
    select: { id: true, name: true, email: true },
  });

  for (const userId of userIds) {
    await prisma.notification.create({
      data: { userId, type: event.type, title, body, metadata: event as object },
    });
  }

  const fullOrder = await prisma.order.findUnique({
    where: { id: event.orderId },
    include: {
      createdBy: { select: { name: true, email: true } },
      currentDivision: { select: { name: true } },
      previousDivision: { select: { name: true } },
      acceptedBy: { select: { name: true, email: true } },
      receivedBy: { select: { name: true, email: true } },
      transfers: {
        orderBy: { createdAt: "asc" },
        include: {
          fromDivision: { select: { name: true } },
          toDivision: { select: { name: true } },
          transferredBy: { select: { name: true } },
        },
      },
    },
  });
  if (!fullOrder) return;

  const breachDivision = await prisma.division.findUnique({
    where: { id: event.divisionId },
    select: { name: true },
  });
  const breachDivisionName = breachDivision?.name ?? `Division #${event.divisionId}`;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const formatUser = (u: { name: string; email: string }) => `${u.name} (${u.email})`;

  const transferPipeline = fullOrder.transfers.map((t) => {
    const reason =
      t.reason.length > MAX_TRANSFER_REASON_EMAIL
        ? `${t.reason.slice(0, MAX_TRANSFER_REASON_EMAIL - 1)}…`
        : t.reason;
    return {
      at: t.createdAt.toISOString(),
      from: t.fromDivision.name,
      to: t.toDivision.name,
      by: t.transferredBy.name,
      reason,
    };
  });

  const customFieldsJson =
    fullOrder.customFields != null ? JSON.stringify(fullOrder.customFields, null, 2) : null;

  const payload = {
    orderNumber: fullOrder.orderNumber,
    companyName: fullOrder.companyName,
    description: fullOrder.description,
    status: fullOrder.status,
    slaDeadlineFormatted: fullOrder.slaDeadline ? fullOrder.slaDeadline.toISOString() : null,
    breachDivisionName,
    createdByLine: formatUser(fullOrder.createdBy),
    currentDivisionName: fullOrder.currentDivision.name,
    previousDivisionName: fullOrder.previousDivision?.name ?? null,
    acceptedByLine: fullOrder.acceptedBy ? formatUser(fullOrder.acceptedBy) : null,
    receivedByLine: fullOrder.receivedBy ? formatUser(fullOrder.receivedBy) : null,
    transferPipeline,
    customFieldsJson,
    orderDetailUrl: `${appUrl}/orders/${fullOrder.id}`,
  };

  await Promise.all(
    users.map(async (u) => {
      const res = await sendSlaBreachDetailEmail(u.email, u.name, payload);
      if (!res.ok) {
        console.error("[email] SLA breach email failed for", u.email, res.error);
      }
    })
  );
}

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

  if (event.type === "SLABreachDetected") {
    await handleSlaBreachNotification(event, title, body);
    return;
  }

  const order = await prisma.order.findUnique({
    where: { id: event.orderId },
    select: { currentDivisionId: true, createdById: true },
  });
  if (!order) return;
  const userIds = new Set<number>([order.createdById]);
  if (event.type === "OrderCancelled") {
    userIds.delete(order.createdById);
  }
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
  const users = await prisma.user.findMany({
    where: { id: { in: [...userIds] } },
    select: { id: true, name: true, email: true },
  });
  for (const userId of userIds) {
    await prisma.notification.create({
      data: { userId, type: event.type, title, body, metadata: event as object },
    });
  }
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
    case "OrderCancelled": {
      const e = event as Extract<OrderEvent, { type: "OrderCancelled" }>;
      return `Enquiry ${e.orderNumber} was cancelled by the submitter. Reason: ${e.reason}`;
    }
    case "OrderReceived":
      return `Enquiry ${event.orderNumber} was received by the new division.`;
    case "OrderCompleted":
      return `Enquiry ${event.orderNumber} has been completed.`;
    case "SLABreachDetected":
      return `Enquiry ${event.orderNumber} has breached the 48-hour SLA.`;
    case "SampleDetailsUpdated":
      return `Sample details were updated for enquiry ${event.orderNumber}.`;
    case "SampleDevelopmentUpdated": {
      const e = event as Extract<OrderEvent, { type: "SampleDevelopmentUpdated" }>;
      return e.developmentType === "new"
        ? `New development details were submitted for enquiry ${e.orderNumber}.`
        : `Existing sample reference was recorded for enquiry ${e.orderNumber}.`;
    }
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
  // n8n is optional; only post when configured to avoid local ECONNREFUSED noise.
  if (process.env.N8N_WEBHOOK_URL?.trim()) {
    subscribe(n8nWebhookHandler);
  }
}
