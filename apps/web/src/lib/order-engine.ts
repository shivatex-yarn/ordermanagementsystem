import { prisma } from "@/lib/db";
import { publish } from "@/lib/events";
import { registerEventHandlers } from "@/lib/event-handlers";
import { cacheDel, cacheKeyOrder, cacheKeyOrdersList } from "@/lib/redis";

const SLA_HOURS = 48;

registerEventHandlers();

function addHours(date: Date, h: number): Date {
  const d = new Date(date);
  d.setHours(d.getHours() + h);
  return d;
}

export async function createOrder(createdById: number, divisionId: number, description?: string) {
  const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const slaDeadline = addHours(new Date(), SLA_HOURS);
  const order = await prisma.order.create({
    data: {
      orderNumber,
      status: "PLACED",
      description,
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
  await cacheDel(cacheKeyOrdersList("*"));
  return order;
}

export async function acceptOrder(orderId: number, acceptedById: number) {
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
  await cacheDel(cacheKeyOrder(orderId));
  await cacheDel(cacheKeyOrdersList("*"));
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
  await cacheDel(cacheKeyOrder(orderId));
  await cacheDel(cacheKeyOrdersList("*"));
  return updated;
}

export async function rejectOrder(orderId: number, rejectedById: number, reason: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return null;
  if (order.status === "REJECTED" || order.status === "COMPLETED") return null;
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
  await cacheDel(cacheKeyOrder(orderId));
  await cacheDel(cacheKeyOrdersList("*"));
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
  await cacheDel(cacheKeyOrder(orderId));
  await cacheDel(cacheKeyOrdersList("*"));
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
  await cacheDel(cacheKeyOrder(orderId));
  await cacheDel(cacheKeyOrdersList("*"));
  return updated;
}
