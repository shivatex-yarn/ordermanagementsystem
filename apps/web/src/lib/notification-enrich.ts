import type { Notification } from "@prisma/client";
import type { OrderEvent } from "@/lib/events";
import { eventTypeToSummary } from "@/lib/event-handlers";
import { formatEnquiryNumber } from "@/lib/enquiry-display";
import { getNotificationShortLabel } from "@/lib/notification-labels";
import { prisma } from "@/lib/db";

function orderNumberFromMetadata(metadata: unknown): string {
  if (!metadata || typeof metadata !== "object") return "";
  const m = metadata as Record<string, unknown>;
  return typeof m.orderNumber === "string" ? m.orderNumber : "";
}

export function getNotificationActorId(type: string, metadata: unknown): number | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;
  const m = metadata as Record<string, unknown>;
  const n = (x: unknown): number | undefined => (typeof x === "number" ? x : undefined);
  switch (type) {
    case "OrderCreated":
      return n(m.createdById);
    case "OrderAccepted":
      return n(m.acceptedById) ?? n(m.userId);
    case "OrderTransferred":
      return n(m.transferredById) ?? n(m.userId);
    case "OrderRejected":
      return n(m.rejectedById) ?? n(m.userId);
    case "OrderReceived":
      return n(m.receivedById) ?? n(m.userId);
    case "OrderCompleted":
      return n(m.completedById) ?? n(m.userId);
    case "SampleApproved":
      return n(m.approvedById) ?? n(m.userId);
    case "SalesFeedbackRecorded":
      return n(m.submittedById) ?? n(m.userId);
    case "SampleDetailsUpdated":
    case "SampleShipped":
    case "SLABreachDetected":
      return n(m.userId);
    default:
      return n(m.userId);
  }
}

function summaryFromMetadata(type: string, metadata: unknown): string {
  if (!metadata || typeof metadata !== "object") return "Update on one of your enquiries.";
  const raw = metadata as Record<string, unknown>;
  const orderNumber = typeof raw.orderNumber === "string" ? raw.orderNumber : "";
  const displayNum = formatEnquiryNumber(orderNumber);
  const event = { ...raw, type, orderNumber: displayNum } as OrderEvent;
  try {
    return eventTypeToSummary(type, event);
  } catch {
    return `${displayNum}: ${getNotificationShortLabel(type)}`;
  }
}

export type EnrichedNotification = {
  id: number;
  type: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  metadata: unknown;
  enquiryNumberDisplay: string;
  label: string;
  summary: string;
  actor: { id: number; name: string; email: string } | null;
};

export async function enrichNotificationRecords(
  notifications: Notification[]
): Promise<EnrichedNotification[]> {
  const actorIds = new Set<number>();
  for (const n of notifications) {
    const aid = getNotificationActorId(n.type, n.metadata);
    if (aid != null) actorIds.add(aid);
  }
  const users =
    actorIds.size > 0
      ? await prisma.user.findMany({
          where: { id: { in: [...actorIds] } },
          select: { id: true, name: true, email: true },
        })
      : [];
  const userMap = new Map(users.map((u) => [u.id, u]));

  return notifications.map((n) => {
    const rawNum = orderNumberFromMetadata(n.metadata);
    const aid = getNotificationActorId(n.type, n.metadata);
    return {
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      read: n.read,
      createdAt: n.createdAt.toISOString(),
      metadata: n.metadata,
      enquiryNumberDisplay: formatEnquiryNumber(rawNum || "—"),
      label: getNotificationShortLabel(n.type),
      summary: summaryFromMetadata(n.type, n.metadata),
      actor: aid != null ? userMap.get(aid) ?? null : null,
    };
  });
}
