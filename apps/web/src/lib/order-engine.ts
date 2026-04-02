import { prisma } from "@/lib/db";
import { publish } from "@/lib/events";
import { registerEventHandlers } from "@/lib/event-handlers";
const SLA_HOURS = 48;

registerEventHandlers();

function addHours(date: Date, h: number): Date {
  const d = new Date(date);
  d.setHours(d.getHours() + h);
  return d;
}

export async function createOrder(
  createdById: number,
  divisionId: number,
  data: {
    companyName: string;
    description: string;
    customFields?: Record<string, unknown>;
    sampleRequested?: boolean;
    sampleRequestNotes?: string | null;
  }
) {
  const orderNumber = `Enq-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const slaDeadline = addHours(new Date(), SLA_HOURS);
  const sampleRequested = Boolean(data.sampleRequested);
  const order = await prisma.order.create({
    data: {
      orderNumber,
      status: "PLACED",
      companyName: data.companyName,
      description: data.description,
      customFields: (data.customFields ?? undefined) as object | undefined,
      sampleRequested,
      sampleRequestNotes:
        sampleRequested && data.sampleRequestNotes?.trim() ? data.sampleRequestNotes.trim() : null,
      createdById,
      currentDivisionId: divisionId,
      slaDeadline,
    },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      currentDivision: { select: { id: true, name: true } },
    },
  });
  await publish({
    type: "OrderCreated",
    orderId: order.id,
    orderNumber: order.orderNumber,
    createdById: order.createdById,
    divisionId: order.currentDivisionId,
    timestamp: order.createdAt.toISOString(),
    userId: createdById,
  });
  return order;
}

export async function updateOrderWithEditHistory(
  orderId: number,
  userId: number,
  data: { companyName?: string; description?: string; customFields?: Record<string, unknown> },
  isSuperAdmin = false
) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return null;
  if (order.status !== "PLACED") return null;
  if (!isSuperAdmin && order.createdById !== userId) return null;

  const historyEntries: { fieldName: string; oldValue: string | null; newValue: string | null }[] = [];
  if (data.companyName !== undefined && data.companyName !== order.companyName) {
    historyEntries.push({
      fieldName: "companyName",
      oldValue: order.companyName,
      newValue: data.companyName,
    });
  }
  if (data.description !== undefined && data.description !== order.description) {
    historyEntries.push({
      fieldName: "description",
      oldValue: order.description,
      newValue: data.description,
    });
  }
  if (data.customFields !== undefined && JSON.stringify(data.customFields) !== JSON.stringify(order.customFields)) {
    historyEntries.push({
      fieldName: "customFields",
      oldValue: order.customFields ? JSON.stringify(order.customFields) : null,
      newValue: data.customFields ? JSON.stringify(data.customFields) : null,
    });
  }
  if (historyEntries.length === 0) {
    return prisma.order.findUnique({
      where: { id: orderId },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        currentDivision: { select: { id: true, name: true } },
        editHistory: { include: { user: { select: { id: true, name: true, email: true } } } },
      },
    });
  }

  await prisma.$transaction([
    prisma.order.update({
      where: { id: orderId },
      data: {
        ...(data.companyName !== undefined && { companyName: data.companyName }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.customFields !== undefined && { customFields: data.customFields as object }),
      },
    }),
    ...historyEntries.map((e) =>
      prisma.orderEditHistory.create({
        data: {
          orderId,
          fieldName: e.fieldName,
          oldValue: e.oldValue,
          newValue: e.newValue,
          userId,
        },
      })
    ),
  ]);
  return prisma.order.findUnique({
    where: { id: orderId },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      currentDivision: { select: { id: true, name: true } },
      editHistory: { include: { user: { select: { id: true, name: true, email: true } } } },
    },
  });
}

export async function acceptOrder(orderId: number, acceptedById: number, _reason: string) {
  void _reason;
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return null;
  if (order.status !== "PLACED" && order.status !== "TRANSFERRED") return null;
  const updated = await prisma.order.update({
    where: { id: orderId },
    data: {
      status: "IN_PROGRESS",
      acceptedById,
      slaDeadline: null,
    },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      currentDivision: { select: { id: true, name: true } },
      acceptedBy: { select: { id: true, name: true, email: true } },
    },
  });
  await publish({
    type: "OrderAccepted",
    orderId: updated.id,
    orderNumber: updated.orderNumber,
    acceptedById: updated.acceptedById!,
    divisionId: updated.currentDivisionId,
    timestamp: new Date().toISOString(),
    userId: acceptedById,
  });
  return updated;
}

export async function transferOrder(
  orderId: number,
  transferredById: number,
  toDivisionId: number,
  reason: string
) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return null;
  if (order.status !== "PLACED" && order.status !== "TRANSFERRED" && order.status !== "IN_PROGRESS")
    return null;
  const slaDeadline = addHours(new Date(), SLA_HOURS);
  const [transfer] = await prisma.$transaction([
    prisma.orderTransfer.create({
      data: {
        orderId,
        fromDivisionId: order.currentDivisionId,
        toDivisionId,
        reason,
        transferredById,
      },
    }),
    prisma.order.update({
      where: { id: orderId },
      data: {
        status: "TRANSFERRED",
        previousDivisionId: order.currentDivisionId,
        currentDivisionId: toDivisionId,
        transferCount: { increment: 1 },
        slaDeadline,
      },
    }),
  ]);
  const updated = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      currentDivision: { select: { id: true, name: true } },
      previousDivision: { select: { id: true, name: true } },
    },
  });
  if (!updated) return null;
  await publish({
    type: "OrderTransferred",
    orderId: updated.id,
    orderNumber: updated.orderNumber,
    fromDivisionId: transfer.fromDivisionId,
    toDivisionId: transfer.toDivisionId,
    reason: transfer.reason,
    transferredById,
    timestamp: new Date().toISOString(),
    userId: transferredById,
  });
  return updated;
}

export async function rejectOrder(orderId: number, rejectedById: number, reason: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return null;
  if (order.status === "REJECTED" || order.status === "COMPLETED" || order.status === "CANCELLED") return null;
  await prisma.$transaction([
    prisma.orderRejection.create({
      data: { orderId, divisionId: order.currentDivisionId, reason, rejectedById },
    }),
    prisma.order.update({
      where: { id: orderId },
      data: {
        status: "REJECTED",
        rejectedById,
        rejectionCount: { increment: 1 },
        slaDeadline: null,
      },
    }),
  ]);
  const updated = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      currentDivision: { select: { id: true, name: true } },
      rejectedBy: { select: { id: true, name: true, email: true } },
    },
  });
  if (!updated) return null;
  await publish({
    type: "OrderRejected",
    orderId: updated.id,
    orderNumber: updated.orderNumber,
    divisionId: updated.currentDivisionId,
    reason,
    rejectedById,
    timestamp: new Date().toISOString(),
    userId: rejectedById,
  });
  return updated;
}

/** Creator withdraws an enquiry before division action (status must be PLACED). */
export async function cancelOrderByCreator(orderId: number, cancelledById: number, reason: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return null;
  if (order.status !== "PLACED") return null;
  if (order.createdById !== cancelledById) return null;
  const trimmed = reason.trim();
  if (trimmed.length < 10) return null;

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancelledById,
      cancellationReason: trimmed,
      slaDeadline: null,
    },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      currentDivision: { select: { id: true, name: true } },
      cancelledBy: { select: { id: true, name: true, email: true } },
    },
  });
  await publish({
    type: "OrderCancelled",
    orderId: updated.id,
    orderNumber: updated.orderNumber,
    divisionId: updated.currentDivisionId,
    cancelledById,
    reason: trimmed,
    timestamp: new Date().toISOString(),
    userId: cancelledById,
  });
  return updated;
}

export async function receiveOrder(orderId: number, receivedById: number) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return null;
  if (order.status !== "TRANSFERRED") return null;
  const slaDeadline = addHours(new Date(), SLA_HOURS);
  const updated = await prisma.order.update({
    where: { id: orderId },
    data: { receivedById, slaDeadline },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      currentDivision: { select: { id: true, name: true } },
      receivedBy: { select: { id: true, name: true, email: true } },
    },
  });
  await publish({
    type: "OrderReceived",
    orderId: updated.id,
    orderNumber: updated.orderNumber,
    receivedById,
    divisionId: updated.currentDivisionId,
    timestamp: new Date().toISOString(),
    userId: receivedById,
  });
  return updated;
}

export async function completeOrder(orderId: number, completedById: number) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return null;
  if (order.status !== "IN_PROGRESS") return null;
  const completedAt = new Date();
  const durationMs = completedAt.getTime() - order.createdAt.getTime();
  const updated = await prisma.order.update({
    where: { id: orderId },
    data: { status: "COMPLETED", completedById, completedAt, slaDeadline: null },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      currentDivision: { select: { id: true, name: true } },
      completedBy: { select: { id: true, name: true, email: true } },
    },
  });
  await publish({
    type: "OrderCompleted",
    orderId: updated.id,
    orderNumber: updated.orderNumber,
    completedById,
    timestamp: completedAt.toISOString(),
    userId: completedById,
    durationMs,
  });
  return updated;
}

export async function updateOrderSampleDetails(
  orderId: number,
  userId: number,
  input: { sampleDetails?: string; sampleQuantity?: string; sampleWeight?: string }
) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order?.sampleRequested) return null;
  if (order.status === "REJECTED" || order.status === "COMPLETED" || order.status === "CANCELLED") return null;
  const sampleDetails =
    input.sampleDetails !== undefined ? input.sampleDetails.trim() || null : undefined;
  const sampleQuantity =
    input.sampleQuantity !== undefined ? input.sampleQuantity.trim() || null : undefined;
  const sampleWeight =
    input.sampleWeight !== undefined ? input.sampleWeight.trim() || null : undefined;
  if (sampleDetails === undefined && sampleQuantity === undefined && sampleWeight === undefined) return null;
  const updated = await prisma.order.update({
    where: { id: orderId },
    data: {
      ...(sampleDetails !== undefined && { sampleDetails }),
      ...(sampleQuantity !== undefined && { sampleQuantity }),
      ...(sampleWeight !== undefined && { sampleWeight }),
    },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      currentDivision: { select: { id: true, name: true } },
    },
  });
  await publish({
    type: "SampleDetailsUpdated",
    orderId: updated.id,
    orderNumber: updated.orderNumber,
    divisionId: updated.currentDivisionId,
    timestamp: new Date().toISOString(),
    userId,
  });
  return updated;
}

export async function updateOrderSampleDevelopment(
  orderId: number,
  userId: number,
  input: {
    developmentType: "existing" | "new";
    existingReference?: string;
    whyNewDevelopment?: string;
    technicalDetails?: string;
    requestedDetailsToSubmit?: string;
  }
) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order?.sampleRequested) return null;
  if (order.status === "REJECTED" || order.status === "COMPLETED" || order.status === "CANCELLED") return null;

  const current = (order.customFields && typeof order.customFields === "object"
    ? (order.customFields as Record<string, unknown>)
    : {}) as Record<string, unknown>;

  const sd: Record<string, unknown> = {
    type: input.developmentType,
    updatedAt: new Date().toISOString(),
    updatedById: userId,
  };

  if (input.developmentType === "existing") {
    sd.existingReference = input.existingReference?.trim() || "";
  } else {
    sd.whyNewDevelopment = input.whyNewDevelopment?.trim() || "";
    sd.technicalDetails = input.technicalDetails?.trim() || "";
    sd.requestedDetailsToSubmit = input.requestedDetailsToSubmit?.trim() || "";
  }

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: {
      customFields: {
        ...current,
        sampleDevelopment: sd,
      } as object,
    },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      currentDivision: { select: { id: true, name: true } },
    },
  });

  await publish({
    type: "SampleDevelopmentUpdated",
    orderId: updated.id,
    orderNumber: updated.orderNumber,
    divisionId: updated.currentDivisionId,
    developmentType: input.developmentType,
    timestamp: new Date().toISOString(),
    userId,
  });
  return updated;
}

export async function approveOrderSample(orderId: number, userId: number) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order?.sampleRequested || order.sampleApprovedAt) return null;
  if (order.status === "REJECTED" || order.status === "COMPLETED" || order.status === "CANCELLED") return null;
  const hasSavedDetails =
    Boolean(order.sampleDetails?.trim()) ||
    Boolean(order.sampleQuantity?.trim()) ||
    Boolean(order.sampleWeight?.trim());
  const sd =
    order.customFields && typeof order.customFields === "object"
      ? ((order.customFields as Record<string, unknown>).sampleDevelopment as Record<string, unknown> | undefined)
      : undefined;
  const hasNewDev =
    sd &&
    sd.type === "new" &&
    typeof sd.whyNewDevelopment === "string" &&
    sd.whyNewDevelopment.trim().length > 0 &&
    typeof sd.technicalDetails === "string" &&
    sd.technicalDetails.trim().length > 0;
  const hasExistingRef =
    sd && sd.type === "existing" && typeof sd.existingReference === "string" && sd.existingReference.trim().length > 0;
  if (!hasSavedDetails && !hasNewDev && !hasExistingRef) return null;
  const updated = await prisma.order.update({
    where: { id: orderId },
    data: {
      sampleApprovedAt: new Date(),
      sampleApprovedById: userId,
    },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      currentDivision: { select: { id: true, name: true } },
      sampleApprovedBy: { select: { id: true, name: true, email: true } },
    },
  });
  await publish({
    type: "SampleApproved",
    orderId: updated.id,
    orderNumber: updated.orderNumber,
    divisionId: updated.currentDivisionId,
    approvedById: userId,
    timestamp: new Date().toISOString(),
    userId,
  });
  return updated;
}

export async function recordSampleShipment(
  orderId: number,
  userId: number,
  input: { sentByCourier?: boolean; courierName?: string; trackingId?: string; sampleProofUrl?: string }
) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order?.sampleRequested || !order.sampleApprovedAt || order.sampleShippedAt) return null;
  if (order.status === "REJECTED" || order.status === "COMPLETED" || order.status === "CANCELLED") return null;
  const sentByCourier = input.sentByCourier !== false;
  const courierName = input.courierName?.trim() || null;
  const trackingId = input.trackingId?.trim() || null;
  if (sentByCourier && (!courierName || !trackingId)) return null;
  const sampleProofUrl = input.sampleProofUrl?.trim() || null;
  const updated = await prisma.order.update({
    where: { id: orderId },
    data: {
      sampleShippedAt: new Date(),
      sampleShippedByCourier: sentByCourier,
      courierName: sentByCourier ? courierName : null,
      trackingId: sentByCourier ? trackingId : null,
      sampleProofUrl,
    },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      currentDivision: { select: { id: true, name: true } },
    },
  });
  await publish({
    type: "SampleShipped",
    orderId: updated.id,
    orderNumber: updated.orderNumber,
    divisionId: updated.currentDivisionId,
    courierName: updated.courierName ?? "",
    trackingId: updated.trackingId ?? "",
    timestamp: new Date().toISOString(),
    userId,
  });
  return updated;
}

export async function recordSalesFeedback(orderId: number, userId: number, salesFeedback: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return null;
  if (order.status === "REJECTED" || order.status === "COMPLETED" || order.status === "CANCELLED") return null;
  const trimmed = salesFeedback.trim();
  if (!trimmed) return null;
  const updated = await prisma.order.update({
    where: { id: orderId },
    data: { salesFeedback: trimmed, salesFeedbackAt: new Date() },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      currentDivision: { select: { id: true, name: true } },
    },
  });
  await publish({
    type: "SalesFeedbackRecorded",
    orderId: updated.id,
    orderNumber: updated.orderNumber,
    submittedById: userId,
    timestamp: new Date().toISOString(),
    userId,
  });
  return updated;
}
