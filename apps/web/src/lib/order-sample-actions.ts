import { prisma } from "@/lib/db";
import type { Role } from "@prisma/client";
import {
  approveOrderSample,
  recordSalesFeedback,
  recordSampleShipment,
  updateOrderSampleDevelopment,
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

/** Creator (sales/user) and super roles */
export async function canSubmitSalesFeedbackAsync(
  userId: number,
  role: Role,
  order: { createdById: number; currentDivisionId: number }
): Promise<boolean> {
  if (role === "SUPER_ADMIN" || role === "MANAGING_DIRECTOR") return true;
  if (order.createdById === userId) return true;
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
        sampleWeight: action.sampleWeight,
      });
      if (!order) {
        return NextResponse.json(
          { error: "Cannot update sample details (sample not requested or invalid state)" },
          { status: 400 }
        );
      }
      return NextResponse.json(order);
    }
    case "setDevelopment": {
      const order = await updateOrderSampleDevelopment(orderId, userId, {
        developmentType: action.developmentType,
        existingReference: action.existingReference,
        whyNewDevelopment: action.whyNewDevelopment,
        technicalDetails: action.technicalDetails,
        requestedDetailsToSubmit: action.requestedDetailsToSubmit,
      });
      if (!order) {
        return NextResponse.json(
          { error: "Cannot update sample development info (sample not requested or invalid state)" },
          { status: 400 }
        );
      }
      return NextResponse.json(order);
    }
    case "approve": {
      const pre = await prisma.order.findUnique({
        where: { id: orderId },
        select: { sampleDetails: true, sampleQuantity: true, sampleWeight: true, customFields: true },
      });
      const hasSaved = [pre?.sampleDetails, pre?.sampleQuantity, pre?.sampleWeight].some((s) => s?.trim());
      const sd =
        pre?.customFields && typeof pre.customFields === "object"
          ? ((pre.customFields as Record<string, unknown>).sampleDevelopment as Record<string, unknown> | undefined)
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
      if (!hasSaved) {
        if (hasNewDev || hasExistingRef) {
          // ok — development info is saved
        } else {
        return NextResponse.json(
          {
            error:
              "Save sample details first — enter at least one of details, quantity, or weight, then save.",
          },
          { status: 400 }
        );
        }
      }
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
        sentByCourier: action.sentByCourier,
        courierName: action.courierName,
        trackingId: action.trackingId,
        sampleProofUrl: action.sampleProofUrl,
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
