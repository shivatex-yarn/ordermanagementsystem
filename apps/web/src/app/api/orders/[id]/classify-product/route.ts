/**
 * POST /api/orders/[id]/classify-product
 *
 * Division Head classifies the enquiry as existing or new product development and submits
 * the required structured details. For existing: previously-developed product reference.
 * For new: complete development requirements & expectations.
 *
 * Body: { kind: 'EXISTING'|'NEW', existingProductRef?: string, newProductSpecs?: string }
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { publish } from "@/lib/events";
import { isDivisionHead } from "@/lib/roles";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await withAuth();
  if (auth.response) return auth.response;
  const { id } = await ctx.params;
  const orderId = Number(id);
  if (!Number.isInteger(orderId) || orderId < 1) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const userId = Number(auth.payload.sub);
  const role = auth.payload.role;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, currentDivisionId: true, status: true },
  });
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const adminBypass = role === "SUPER_ADMIN" || role === "MANAGING_DIRECTOR";
  if (!adminBypass) {
    if (!isDivisionHead(role)) {
      return NextResponse.json({ error: "Only Division Head can classify the product" }, { status: 403 });
    }
    const mapping = await prisma.divisionManager.findFirst({
      where: { userId, divisionId: order.currentDivisionId },
      select: { id: true },
    });
    if (!mapping) {
      return NextResponse.json({ error: "You do not manage this division" }, { status: 403 });
    }
  }

  const body = (await req.json().catch(() => ({}))) as {
    kind?: unknown;
    existingProductRef?: unknown;
    newProductSpecs?: unknown;
  };
  const kind = body.kind === "EXISTING" || body.kind === "NEW" ? body.kind : null;
  if (!kind) return NextResponse.json({ error: "kind must be EXISTING or NEW" }, { status: 400 });

  const existingRef = typeof body.existingProductRef === "string" ? body.existingProductRef.trim() : "";
  const newSpecs = typeof body.newProductSpecs === "string" ? body.newProductSpecs.trim() : "";
  if (kind === "EXISTING" && existingRef.length < 5) {
    return NextResponse.json({ error: "Existing product reference is required (min 5 chars)" }, { status: 400 });
  }
  if (kind === "NEW" && newSpecs.length < 20) {
    return NextResponse.json(
      { error: "Complete product development details are required (min 20 chars)" },
      { status: 400 }
    );
  }

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: {
      productKind: kind,
      existingProductRef: kind === "EXISTING" ? existingRef : null,
      newProductSpecs: kind === "NEW" ? newSpecs : null,
    },
    select: {
      id: true,
      orderNumber: true,
      currentDivisionId: true,
      productKind: true,
      existingProductRef: true,
      newProductSpecs: true,
    },
  });

  await publish({
    type: "SampleDevelopmentUpdated",
    orderId: updated.id,
    orderNumber: updated.orderNumber,
    divisionId: updated.currentDivisionId,
    developmentType: kind === "EXISTING" ? "existing" : "new",
    timestamp: new Date().toISOString(),
    userId,
  });

  return NextResponse.json({ ok: true, enquiry: updated });
}
