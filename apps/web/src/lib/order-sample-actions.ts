import { prisma } from "@/lib/db";
import type { Role } from "@prisma/client";
import {
  approveOrderSample,
  recordSalesFeedback,
  recordSampleShipment,
  updateOrderSampleDetails,
} from "@/lib/order-engine";
import { orderSampleActionSchema } from "@/lib/validation";
import { NextResponse } from "next/server";

export async function userCanManageSampleForOrder(
  userId: number,
  role: Role,
  currentDivisionId: number
): Promise<boolean> {
  if (role === "SUPER_ADMIN" || role === "MANAGING_DIRECTOR") return true;
  if (role !== "MANAGER") return false;
  const asManager = await prisma.divisionManager.findFirst({
    where: { userId, divisionId: currentDivisionId },
  });
  if (asManager) return true;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { divisionId: true } });
  return u?.divisionId === currentDivisionId;
}

/** Creator, supervisor, division manager (incl. multi-division), super roles */
export async function canSubmitSalesFeedbackAsync(
  userId: number,
  role: Role,
  order: { createdById: number; currentDivisionId: number }
): Promise<boolean> {
  if (role === "SUPER_ADMIN" || role === "MANAGING_DIRECTOR") return true;
  if (order.createdById === userId) return true;
  if (role === "SUPERVISOR") return true;
  if (role === "MANAGER") {
    return userCanManageSampleForOrder(userId, role, order.currentDivisionId);
  }
  return false;
}

export async function getIntegrationActorUserId(): Promise<number | null> {
  const envId = process.env.N8N_INTEGRATION_USER_ID?.trim();
  if (envId) {
    const n = Number(envId);
    if (Number.isInteger(n) && n > 0) return n;
  }
  const u = await prisma.user.findFirst({
    where: { role: "SUPER_ADMIN", active: true },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  return u?.id ?? null;
}

export async function runSampleAction(
  orderId: number,
  userId: number,
  body: unknown
): Promise<NextResponse> {
  const parsed = orderSampleActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const action = parsed.data;

  switch (action.action) {
    case "setDetails": {
      const order = await updateOrderSampleDetails(orderId, userId, {
        sampleDetails: action.sampleDetails,
        sampleQuantity: action.sampleQuantity,
      });
      if (!order) {
        return NextResponse.json(
          { error: "Cannot update sample details (sample not requested or invalid state)" },
          { status: 400 }
        );
      }
      return NextResponse.json(order);
    }
    case "approve": {
      const order = await approveOrderSample(orderId, userId);
      if (!order) {
        return NextResponse.json(
          { error: "Cannot approve sample (not requested, already approved, or invalid state)" },
          { status: 400 }
        );
      }
      return NextResponse.json(order);
    }
    case "ship": {
      const order = await recordSampleShipment(orderId, userId, {
        courierName: action.courierName,
        trackingId: action.trackingId,
      });
      if (!order) {
        return NextResponse.json(
          { error: "Cannot record shipment (approve sample first or already shipped)" },
          { status: 400 }
        );
      }
      return NextResponse.json(order);
    }
    case "salesFeedback": {
      const order = await recordSalesFeedback(orderId, userId, action.salesFeedback);
      if (!order) {
        return NextResponse.json({ error: "Cannot record feedback" }, { status: 400 });
      }
      return NextResponse.json(order);
    }
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
