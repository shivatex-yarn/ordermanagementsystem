/**
 * POST /api/orders/[id]/classify-product
 *
 * Division Head classifies the enquiry as EXISTING product or NEW development.
 *
 * EXISTING → submit existing product ref + sample info + internal remarks.
 *             SLA continues normally (already running from creation).
 *
 * NEW      → opens the New Development popup. We mark `planningStartedAt` and
 *             PAUSE the SLA clock by clearing `slaDeadline`. SLA resumes only after
 *             `complete-planning` is called.
 *
 * Body: { kind: 'EXISTING'|'NEW' }  (additional fields land in the next call:
 *         /classify-product accepts kind only; existing details go to PATCH this same
 *         route with `kind: EXISTING, existingProductRef, existingSampleInfo,
 *         existingInternalRemarks`; new-dev planning fields go to /new-development-plan.)
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { classifyExistingProductSchema } from "@/lib/validation";
import { publish } from "@/lib/events";

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
    select: { id: true, currentDivisionId: true, status: true, productKind: true },
  });
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const adminBypass = role === "SUPER_ADMIN" || role === "MANAGING_DIRECTOR";
  if (!adminBypass) {
    if (role !== "MANAGER") {
      return NextResponse.json(
        { error: `Only Division Head can classify products (your role: ${role}).` },
        { status: 403 }
      );
    }
    // Accept either (a) the user is a DivisionManager for the enquiry's division, OR
    // (b) the enquiry's division is the user's primary division — covers managers who were
    // only set up via `user.division_id` and never explicitly added to `division_managers`.
    const [managerRow, userRow] = await Promise.all([
      prisma.divisionManager.findFirst({
        where: { userId, divisionId: order.currentDivisionId },
        select: { id: true },
      }),
      prisma.user.findUnique({ where: { id: userId }, select: { divisionId: true } }),
    ]);
    if (!managerRow && userRow?.divisionId !== order.currentDivisionId) {
      return NextResponse.json(
        {
          error:
            "You do not manage this division. Ask Super Admin to map you to this division (Admin → Divisions → Managers).",
        },
        { status: 403 }
      );
    }
  }

  const body = (await req.json().catch(() => ({}))) as {
    kind?: unknown;
    existingProductRef?: unknown;
    existingSampleInfo?: unknown;
    existingInternalRemarks?: unknown;
  };
  const kind = body.kind === "EXISTING" || body.kind === "NEW" ? body.kind : null;
  if (!kind) return NextResponse.json({ error: "kind must be EXISTING or NEW" }, { status: 400 });

  const explainSchemaError = (err: unknown): string | null => {
    const msg = err instanceof Error ? err.message : String(err);
    if (/column .* does not exist/i.test(msg) || /Unknown arg.*product_kind|Unknown arg.*productKind/i.test(msg)) {
      return "Database is missing Phase-2 columns. Run: cd apps/web && npx prisma migrate deploy && npx prisma generate, then restart the dev server.";
    }
    return null;
  };

  if (kind === "EXISTING") {
    const parsed = classifyExistingProductSchema.safeParse({
      existingProductRef: body.existingProductRef,
      existingSampleInfo: body.existingSampleInfo,
      existingInternalRemarks: body.existingInternalRemarks,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    let updated;
    try {
      updated = await prisma.order.update({
        where: { id: orderId },
        data: {
          productKind: "EXISTING",
          existingProductRef: parsed.data.existingProductRef.trim(),
          existingSampleInfo: parsed.data.existingSampleInfo.trim() || null,
          existingInternalRemarks: parsed.data.existingInternalRemarks.trim() || null,
          // SLA continues from creation — do not touch slaDeadline.
        },
        select: { id: true, productKind: true, existingProductRef: true },
      });
    } catch (err) {
      const hint = explainSchemaError(err);
      console.error("[classify-product:EXISTING]", err);
      return NextResponse.json(
        { error: hint ?? (err instanceof Error ? err.message : "Database update failed") },
        { status: 503 }
      );
    }
    await publish({
      type: "ProductClassified",
      orderId,
      orderNumber: (await prisma.order.findUnique({ where: { id: orderId }, select: { orderNumber: true } }))!
        .orderNumber,
      divisionId: order.currentDivisionId,
      kind: "EXISTING",
      existingProductRef: updated.existingProductRef ?? undefined,
      timestamp: new Date().toISOString(),
      userId,
    });
    return NextResponse.json({ ok: true, enquiry: updated, classification: "EXISTING" });
  }

  // NEW DEVELOPMENT — pause SLA, mark planningStartedAt. Actual planning fields are
  // submitted via /new-development-plan and locked in via /complete-planning.
  let updated;
  try {
    updated = await prisma.order.update({
      where: { id: orderId },
      data: {
        productKind: "NEW",
        planningStartedAt: new Date(),
        slaDeadline: null, // pause the SLA clock until planning is marked complete
      },
      select: { id: true, productKind: true, planningStartedAt: true },
    });
  } catch (err) {
    const hint = explainSchemaError(err);
    console.error("[classify-product:NEW]", err);
    return NextResponse.json(
      { error: hint ?? (err instanceof Error ? err.message : "Database update failed") },
      { status: 503 }
    );
  }
  await publish({
    type: "ProductClassified",
    orderId,
    orderNumber: (await prisma.order.findUnique({ where: { id: orderId }, select: { orderNumber: true } }))!
      .orderNumber,
    divisionId: order.currentDivisionId,
    kind: "NEW",
    timestamp: new Date().toISOString(),
    userId,
  });
  return NextResponse.json({
    ok: true,
    enquiry: updated,
    classification: "NEW",
    requiresPlanningPopup: true,
  });
}
