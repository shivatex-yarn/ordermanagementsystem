import { prisma } from "@/lib/db";
import { subscribe } from "@/lib/events";
import type { OrderEvent } from "@/lib/events";
import { formatEnquiryNumber } from "@/lib/enquiry-display";
import { getNotificationShortLabel } from "@/lib/notification-labels";
import {
  sendEnquiryNotificationEmail,
  sendSlaBreachDetailEmail,
  sendSupervisorEnquiryHandoffEmail,
} from "@/lib/email";
import { postEventToN8n } from "@/lib/n8n-webhook";
import { appendTimeline, type TimelineEventType } from "@/lib/timeline";

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

  /** SLA breach alerts: every active Super Admin + every active Managing Director (in-app + detailed email). */
  const userIds = new Set<number>();
  const superAdmins = await prisma.user.findMany({
    where: { role: "SUPER_ADMIN", active: true },
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

  if (event.type === "OrderEnquiryHandoffSubmitted") {
    const e = event as Extract<OrderEvent, { type: "OrderEnquiryHandoffSubmitted" }>;
    const order = await prisma.order.findUnique({
      where: { id: event.orderId },
      select: {
        createdById: true,
        currentDivisionId: true,
        companyName: true,
        description: true,
        acceptanceReason: true,
        enquiryHandoff: true,
        orderNumber: true,
      },
    });
    if (!order) return;

    const supervisor = await prisma.user.findUnique({
      where: { id: e.supervisorId },
      select: { id: true, name: true, email: true },
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const handoff =
      order.enquiryHandoff && typeof order.enquiryHandoff === "object"
        ? (order.enquiryHandoff as Record<string, unknown>)
        : {};
    const kind = handoff.developmentKind === "existing" ? ("existing" as const) : ("new" as const);
    const devBody =
      kind === "new"
        ? String(handoff.newDevelopmentDetails ?? "")
        : String(handoff.existingProductDetails ?? "");

    const division = await prisma.division.findUnique({
      where: { id: order.currentDivisionId },
      select: { name: true },
    });

    const userIds = new Set<number>([order.createdById, e.supervisorId]);
    const managers = await prisma.divisionManager.findMany({
      where: { divisionId: order.currentDivisionId },
      select: { userId: true },
    });
    managers.forEach((m) => userIds.add(m.userId));
    const superAdmins = await prisma.user.findMany({
      where: { role: "SUPER_ADMIN", active: true },
      select: { id: true },
    });
    superAdmins.forEach((u) => userIds.add(u.id));

    const notifyUsers = await prisma.user.findMany({
      where: { id: { in: [...userIds] } },
      select: { id: true, name: true, email: true, role: true },
    });

    const title2 = `${formatEnquiryNumber(event.orderNumber)} · ${getNotificationShortLabel(event.type)}`;
    const body2 = JSON.stringify(event);
    for (const uid of userIds) {
      await prisma.notification.create({
        data: { userId: uid, type: event.type, title: title2, body: body2, metadata: event as object },
      });
    }

    if (supervisor?.email) {
      const res = await sendSupervisorEnquiryHandoffEmail(supervisor.email, supervisor.name, {
        orderNumber: order.orderNumber,
        companyName: order.companyName,
        description: order.description,
        divisionName: division?.name ?? "Division",
        acceptanceReason: order.acceptanceReason,
        developmentKind: kind,
        developmentBody: devBody,
        orderUrl: `${appUrl}/orders/${event.orderId}`,
      });
      if (!res.ok) {
        console.error("[email] Supervisor handoff email failed for", supervisor.email, res.error);
      }
    }

    const summary = eventTypeToSummary(event.type, event);
    for (const u of notifyUsers) {
      if (u.id === e.supervisorId) continue;
      // Spec: MD gets only SLA breach emails; skip routine workflow notifications.
      if (u.role === "MANAGING_DIRECTOR") continue;
      sendEnquiryNotificationEmail(u.email, u.name, event.orderNumber, event.type, summary).catch((err) =>
        console.error("[email] Notification email failed for", u.email, err)
      );
    }
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
    select: { id: true, name: true, email: true, role: true },
  });
  for (const userId of userIds) {
    await prisma.notification.create({
      data: { userId, type: event.type, title, body, metadata: event as object },
    });
  }
  const summary = eventTypeToSummary(event.type, event);
  for (const u of users) {
    /**
     * Per spec: MD only receives SLA breach emails. Strip MDs out of routine
     * workflow notifications (creation, handoff, sample, feedback, etc.). The
     * in-app notification was already created above so they still see it in
     * the Notifications page if they want — just no mailbox noise.
     */
    if (u.role === "MANAGING_DIRECTOR") continue;
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
    case "SLABreachHeadRejectionSubmitted": {
      const e = event as Extract<OrderEvent, { type: "SLABreachHeadRejectionSubmitted" }>;
      return `Division Head submitted a delay/breach rejection for enquiry ${e.orderNumber}.`;
    }
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
    case "OrderEnquiryHandoffSubmitted":
      return `Enquiry ${event.orderNumber} was assigned to a division supervisor with development classification.`;
    case "SampleHeadRequestApproved":
      return `Division head approved the sample request for enquiry ${event.orderNumber}.`;
    default:
      return `Enquiry ${event.orderNumber}: ${type}.`;
  }
}

async function n8nWebhookHandler(event: OrderEvent): Promise<void> {
  await postEventToN8n(event);
}

/**
 * Translates an internal OrderEvent into a human-readable EnquiryTimelineEvent row.
 * Drives the Timeline tab + MD recent-activity stream.
 */
async function timelineHandler(event: OrderEvent): Promise<void> {
  const map: Partial<Record<OrderEvent["type"], { type: TimelineEventType; title: string; detail?: string | null }>> = {
    OrderCreated: { type: "ENQUIRY_CREATED", title: "Enquiry created" },
    OrderAccepted: {
      type: "ENQUIRY_APPROVED",
      title: "Approved by Division Head",
      detail: (event as Extract<OrderEvent, { type: "OrderAccepted" }>).acceptanceReason ?? null,
    },
    OrderRejected: {
      type: "ENQUIRY_REJECTED",
      title: "Rejected by Division Head",
      detail: (event as Extract<OrderEvent, { type: "OrderRejected" }>).reason ?? null,
    },
    OrderTransferred: {
      type: "ENQUIRY_TRANSFERRED",
      title: "Transferred to another division",
      detail:
        (event as Extract<OrderEvent, { type: "OrderTransferred" }>).reason ??
        (event as Extract<OrderEvent, { type: "OrderTransferred" }>).transferDetails ??
        null,
    },
    OrderReceived: {
      type: "ENQUIRY_RECEIVED",
      title: "Received by new division",
      detail: (event as Extract<OrderEvent, { type: "OrderReceived" }>).receiveReason ?? null,
    },
    OrderCompleted: { type: "ENQUIRY_COMPLETED", title: "Enquiry completed" },
    OrderCancelled: {
      type: "ENQUIRY_CANCELLED",
      title: "Enquiry cancelled by submitter",
      detail: (event as Extract<OrderEvent, { type: "OrderCancelled" }>).reason ?? null,
    },
    SampleDetailsUpdated: { type: "SAMPLE_DETAILS_SUBMITTED", title: "Sample details submitted" },
    SampleDevelopmentUpdated: {
      type: "PRODUCT_CLASSIFIED",
      title: "Product classification submitted",
      detail:
        (event as Extract<OrderEvent, { type: "SampleDevelopmentUpdated" }>).developmentType === "new"
          ? "Classified as new product development"
          : "Classified as existing product reference",
    },
    SampleApproved: { type: "SAMPLE_APPROVED", title: "Sample approved (final)" },
    SampleHeadRequestApproved: { type: "SAMPLE_APPROVED_BY_HEAD", title: "Sample request approved by Division Head" },
    SampleShipped: {
      type: "SAMPLE_SHIPPED",
      title: "Sample shipped",
      detail:
        `Courier: ${(event as Extract<OrderEvent, { type: "SampleShipped" }>).courierName} · ` +
        `Tracking: ${(event as Extract<OrderEvent, { type: "SampleShipped" }>).trackingId}`,
    },
    SalesFeedbackRecorded: { type: "CUSTOMER_FEEDBACK", title: "Customer feedback submitted" },
    SLABreachDetected: { type: "SLA_BREACHED", title: "SLA breach detected (48-hour rule)" },
    SLABreachHeadRejectionSubmitted: {
      type: "SLA_HEAD_REJECTION",
      title: "Division Head submitted SLA-breach rejection",
      detail: (event as Extract<OrderEvent, { type: "SLABreachHeadRejectionSubmitted" }>).message ?? null,
    },
    OrderEnquiryHandoffSubmitted: {
      type: "HANDOFF_SUBMITTED",
      title: "Handoff submitted to supervisor",
    },
  };
  const m = map[event.type];
  if (!m) return;
  try {
    await appendTimeline({
      orderId: event.orderId,
      type: m.type,
      title: m.title,
      detail: m.detail ?? null,
      actorId: event.userId ?? null,
      metadata: event as unknown as Record<string, unknown>,
    });
  } catch (err) {
    console.error("[timeline] write failed:", err);
  }
}

let registered = false;
export function registerEventHandlers(): void {
  if (registered) return;
  registered = true;
  subscribe(auditHandler);
  subscribe(notificationHandler);
  subscribe(timelineHandler);
  // n8n is optional; only post when configured to avoid local ECONNREFUSED noise.
  if (process.env.N8N_WEBHOOK_URL?.trim()) {
    subscribe(n8nWebhookHandler);
  }
}
