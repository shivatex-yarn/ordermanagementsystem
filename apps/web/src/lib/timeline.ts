/**
 * Enquiry workflow timeline service.
 *
 * Renders as the Timeline tab on the enquiry detail page and as the recent activity
 * stream on the MD dashboard. Append-only — every state transition writes a row.
 *
 * Each event records: type, human title, optional detail string, actorId, free-form
 * metadata, createdAt. We deliberately avoid coupling event types to a closed enum
 * so new flows can add new types without a schema change.
 */

import { prisma } from "@/lib/db";

export type TimelineEventType =
  | "ENQUIRY_CREATED"
  | "ENQUIRY_APPROVED"
  | "ENQUIRY_REJECTED"
  | "ENQUIRY_TRANSFERRED"
  | "ENQUIRY_RECEIVED"
  | "ENQUIRY_COMPLETED"
  | "ENQUIRY_CANCELLED"
  | "PRODUCT_CLASSIFIED"
  | "SAMPLE_REQUESTED"
  | "SAMPLE_DETAILS_SUBMITTED"
  | "SAMPLE_APPROVED_BY_HEAD"
  | "SAMPLE_APPROVED"
  | "SAMPLE_SHIPPED"
  | "SAMPLE_RECEIVED"
  | "CUSTOMER_FEEDBACK"
  | "PRIORITY_CHANGED"
  | "DELAY_REASON_SUBMITTED"
  | "SLA_BREACHED"
  | "SLA_HEAD_REJECTION"
  | "HANDOFF_SUBMITTED"
  | "COMMENT";

export interface AppendTimelineInput {
  orderId: number;
  type: TimelineEventType;
  title: string;
  detail?: string | null;
  actorId?: number | null;
  metadata?: Record<string, unknown> | null;
}

export async function appendTimeline(input: AppendTimelineInput): Promise<void> {
  await prisma.enquiryTimelineEvent.create({
    data: {
      orderId: input.orderId,
      type: input.type,
      title: input.title,
      detail: input.detail ?? null,
      actorId: input.actorId ?? null,
      metadata: (input.metadata ?? undefined) as object | undefined,
    },
  });
}

/**
 * Fetch full timeline for one enquiry, newest first. Joins actor name/email for display.
 */
export async function getEnquiryTimeline(orderId: number, limit = 200) {
  return prisma.enquiryTimelineEvent.findMany({
    where: { orderId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      actor: { select: { id: true, name: true, email: true, role: true } },
    },
  });
}

/** Recent activity across all enquiries — used on MD dashboard. */
export async function getRecentTimeline(limit = 50) {
  return prisma.enquiryTimelineEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      actor: { select: { id: true, name: true, email: true, role: true } },
      order: {
        select: {
          id: true,
          orderNumber: true,
          companyName: true,
          currentDivisionId: true,
          currentDivision: { select: { id: true, name: true } },
        },
      },
    },
  });
}
