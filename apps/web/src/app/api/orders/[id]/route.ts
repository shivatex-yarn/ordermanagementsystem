import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { userCanViewOrder } from "@/lib/order-view-permission";
import { withAuth } from "@/lib/with-auth";
import { canViewCustomerFeedback } from "@/lib/roles";

const fullInclude = {
  createdBy: { select: { id: true, name: true, email: true } },
  currentDivision: {
    select: {
      id: true,
      name: true,
      managers: { include: { user: { select: { id: true, name: true, email: true } } } },
    },
  },
  cancelledBy: { select: { id: true, name: true, email: true } },
  previousDivision: { select: { id: true, name: true } },
  acceptedBy: { select: { id: true, name: true, email: true } },
  rejectedBy: { select: { id: true, name: true, email: true } },
  receivedBy: { select: { id: true, name: true, email: true } },
  completedBy: { select: { id: true, name: true, email: true } },
  sampleApprovedBy: { select: { id: true, name: true, email: true } },
  assignedSupervisor: { select: { id: true, name: true, email: true } },
  headSampleRequestApprovedBy: { select: { id: true, name: true, email: true } },
  sampleSpecsAcknowledgedBy: { select: { id: true, name: true, email: true } },
  slaBreaches: {
    where: { resolvedAt: null },
    orderBy: { breachedAt: "desc" as const },
    take: 1,
    include: {
      headRejectedBy: { select: { id: true, name: true, email: true } },
      division: { select: { id: true, name: true } },
    },
  },
  transfers: {
    include: {
      fromDivision: { select: { id: true, name: true } },
      toDivision: {
        include: {
          managers: {
            include: { user: { select: { id: true, name: true, email: true } } },
          },
        },
      },
      transferredBy: { select: { id: true, name: true, email: true } },
    },
  },
  rejections: {
    include: {
      division: { select: { id: true, name: true } },
      rejectedBy: { select: { id: true, name: true, email: true } },
    },
  },
  editHistory: { include: { user: { select: { id: true, name: true, email: true } } } },
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await withAuth();
  if (auth.response) return auth.response;
  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid enquiry id" }, { status: 400 });
  }
  /**
   * Fetch with up to 2 attempts. The pooler occasionally drops idle connections; the
   * first call surfaces P1001 and the second succeeds.
   *
   * Crucially, on a successful retry we MUST return data — the previous version had a
   * control-flow bug where a successful retry inside the catch still fell through to
   * the generic `return 500`. We now use an explicit result variable + outer-loop break.
   */
  let order: Awaited<ReturnType<typeof prisma.order.findUnique>> | undefined;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      order = await prisma.order.findUnique({ where: { id }, include: fullInclude });
      lastError = null;
      break;
    } catch (err) {
      lastError = err;
      // Retry only on transient pooler closes — schema/permission errors are fatal.
      const code = err instanceof Prisma.PrismaClientKnownRequestError ? err.code : null;
      if (attempt === 0 && (code === "P1001" || code === "P1017" || code === "P2024")) {
        await new Promise((r) => setTimeout(r, 350));
        continue;
      }
      break;
    }
  }

  if (lastError) {
    console.error("[GET /api/orders/[id]]", lastError);
    const msg = lastError instanceof Error ? lastError.message : String(lastError);
    if (lastError instanceof Prisma.PrismaClientKnownRequestError && lastError.code === "P2022") {
      return NextResponse.json(
        {
          error:
            "Database is missing required columns. From apps/web run: npx prisma migrate deploy && npx prisma generate, then restart the dev server.",
          code: "SCHEMA_DRIFT",
        },
        { status: 503 }
      );
    }
    if (/column/i.test(msg) && /does not exist/i.test(msg)) {
      return NextResponse.json(
        {
          error: "Database schema is out of date. Run: cd apps/web && npx prisma migrate deploy",
          code: "SCHEMA_DRIFT",
        },
        { status: 503 }
      );
    }
    if (lastError instanceof Prisma.PrismaClientKnownRequestError && lastError.code === "P1001") {
      return NextResponse.json(
        {
          error: "Database unavailable. Please retry.",
          code: "DB_UNAVAILABLE",
          detail: process.env.NODE_ENV === "development" ? msg : undefined,
        },
        { status: 503 }
      );
    }
    return NextResponse.json(
      {
        error: "Database error while loading enquiry.",
        detail: process.env.NODE_ENV === "development" ? msg : undefined,
      },
      { status: 500 }
    );
  }

  if (!order) return NextResponse.json({ error: "Enquiry not found" }, { status: 404 });

  if (
    !(await userCanViewOrder(auth.payload, {
      createdById: order.createdById,
      currentDivisionId: order.currentDivisionId,
      previousDivisionId: order.previousDivisionId,
    }))
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Spec: customer feedback visible only to Division Head + higher mgmt. Strip for others.
  const canSeeFeedback =
    canViewCustomerFeedback(auth.payload.role) || order.createdById === Number(auth.payload.sub);
  const responseBody = canSeeFeedback
    ? order
    : { ...order, customerFeedback: null, customerFeedbackAt: null };
  return NextResponse.json(responseBody);
}

/**
 * PATCH /api/orders/[id]
 *
 * Role-based field editing:
 *  • Salesperson (creator, USER/ASM/SUPERVISOR)  → customer & product fields (while PLACED)
 *  • Division Head (MANAGER/DIVISION_HEAD)       → handoff / acceptance details (while IN_PROGRESS)
 *  • Supervisor (assignedSupervisorId)           → sample details (any non-closed status)
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await withAuth();
  if (auth.response) return auth.response;

  const { id } = await params;
  const orderId = Number(id);
  if (!Number.isInteger(orderId) || orderId < 1) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      status: true,
      createdById: true,
      currentDivisionId: true,
      assignedSupervisorId: true,
      sampleApprovedAt: true,
    },
  });
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const userId = Number(auth.payload.sub);
  const role = auth.payload.role;
  const closed = ["REJECTED", "CANCELLED", "COMPLETED"].includes(order.status);
  if (closed) return NextResponse.json({ error: "Enquiry is closed" }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : undefined);

  // ── Salesperson: edit customer & product fields while PLACED ──────────────
  if (["USER", "SUPERVISOR", "ASM"].includes(role) && order.createdById === userId) {
    if (order.status !== "PLACED") {
      return NextResponse.json(
        { error: "You can only edit enquiry details before the Division Head acts on it." },
        { status: 400 }
      );
    }
    const data: Record<string, unknown> = {};
    if (str(body.customerName) !== undefined) data.customerName = str(body.customerName) || null;
    if (str(body.customerPhone) !== undefined) data.customerPhone = str(body.customerPhone) || null;
    if (str(body.customerEmail) !== undefined) data.customerEmail = str(body.customerEmail) || null;
    if (str(body.customerAddress) !== undefined) data.customerAddress = str(body.customerAddress) || null;
    if (str(body.gstNumber) !== undefined) data.gstNumber = str(body.gstNumber)?.toUpperCase() || null;
    if (str(body.gstCopyUrl) !== undefined) data.gstCopyUrl = str(body.gstCopyUrl) || null;
    if (str(body.companyName) !== undefined) data.companyName = str(body.companyName) || null;
    if (str(body.description) !== undefined) data.description = str(body.description) || null;
    if (str(body.customerOrderDate) !== undefined) {
      const d = body.customerOrderDate ? new Date(String(body.customerOrderDate)) : null;
      data.customerOrderDate = d && !isNaN(d.getTime()) ? d : null;
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No editable fields provided" }, { status: 400 });
    }
    const updated = await prisma.order.update({ where: { id: orderId }, data });
    return NextResponse.json({ ok: true, order: updated });
  }

  // ── Division Head / Admin: edit handoff, customer fields, newDevPlan ────────
  if (["MANAGER", "DIVISION_HEAD", "SUPER_ADMIN", "MANAGING_DIRECTOR"].includes(role)) {
    const isAdminRole = ["SUPER_ADMIN", "MANAGING_DIRECTOR"].includes(role);
    if (!isAdminRole) {
      const managed = await prisma.divisionManager.findFirst({
        where: { userId, divisionId: order.currentDivisionId },
      });
      if (!managed) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
    const data: Record<string, unknown> = {};
    // Handoff / acceptance notes
    if (str(body.acceptanceReason) !== undefined) data.acceptanceReason = str(body.acceptanceReason) || null;
    if (body.enquiryHandoff !== undefined && typeof body.enquiryHandoff === "object") {
      const existing = (await prisma.order.findUnique({ where: { id: orderId }, select: { enquiryHandoff: true } }))?.enquiryHandoff as Record<string, unknown> | null ?? {};
      data.enquiryHandoff = { ...existing, ...(body.enquiryHandoff as Record<string, unknown>) };
    }
    // Customer & product fields (HEAD can correct these in any non-closed status)
    if (str(body.customerName) !== undefined) data.customerName = str(body.customerName) || null;
    if (str(body.customerPhone) !== undefined) data.customerPhone = str(body.customerPhone) || null;
    if (str(body.customerEmail) !== undefined) data.customerEmail = str(body.customerEmail) || null;
    if (str(body.customerAddress) !== undefined) data.customerAddress = str(body.customerAddress) || null;
    if (str(body.gstNumber) !== undefined) data.gstNumber = str(body.gstNumber)?.toUpperCase() || null;
    if (str(body.gstCopyUrl) !== undefined) data.gstCopyUrl = str(body.gstCopyUrl) || null;
    if (str(body.companyName) !== undefined) data.companyName = str(body.companyName) || null;
    if (str(body.description) !== undefined) data.description = str(body.description) || null;
    if (str(body.customerOrderDate) !== undefined) {
      const d = body.customerOrderDate ? new Date(String(body.customerOrderDate)) : null;
      data.customerOrderDate = d && !isNaN(d.getTime()) ? d : null;
    }
    // New dev plan editing (replaces entire plan object); keep `enquiryHandoff.planning` in sync for list/detail views.
    if (body.newDevPlan !== undefined) {
      data.newDevPlan = (typeof body.newDevPlan === "object" ? body.newDevPlan : null) as unknown;
      if (typeof body.newDevPlan === "object" && body.newDevPlan) {
        const row = await prisma.order.findUnique({
          where: { id: orderId },
          select: { enquiryHandoff: true },
        });
        const eh = row?.enquiryHandoff as Record<string, unknown> | null;
        if (eh && eh.developmentKind === "new") {
          const plan = body.newDevPlan as Record<string, unknown>;
          const desc = typeof plan.description === "string" ? plan.description.trim() : "";
          data.enquiryHandoff = {
            ...eh,
            planning: body.newDevPlan as object,
            ...(desc ? { newDevelopmentDetails: desc } : {}),
          };
        }
      }
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No editable fields provided" }, { status: 400 });
    }
    const updated = await prisma.order.update({ where: { id: orderId }, data });
    return NextResponse.json({ ok: true, order: updated });
  }

  // ── Supervisor / ASM: edit sample details ────────────────────────────────
  if (["SUPERVISOR", "ASM"].includes(role) && order.assignedSupervisorId === userId) {
    const data: Record<string, unknown> = {};
    if (str(body.sampleDetails) !== undefined) data.sampleDetails = str(body.sampleDetails) || null;
    if (str(body.sampleQuantity) !== undefined) data.sampleQuantity = str(body.sampleQuantity) || null;
    if (str(body.sampleWeight) !== undefined) data.sampleWeight = str(body.sampleWeight) || null;
    if (str(body.sampleRemarks) !== undefined) data.sampleRemarks = str(body.sampleRemarks) || null;
    if (str(body.courierName) !== undefined) data.courierName = str(body.courierName) || null;
    if (str(body.trackingId) !== undefined) data.trackingId = str(body.trackingId) || null;
    if (typeof body.sampleShippedByCourier === "boolean") data.sampleShippedByCourier = body.sampleShippedByCourier;
    if (str(body.sampleDeliveryDate) !== undefined) {
      const d = body.sampleDeliveryDate ? new Date(String(body.sampleDeliveryDate)) : null;
      data.sampleDeliveryDate = d && !isNaN(d.getTime()) ? d : null;
    }
    const touchesSampleSpecsContent =
      str(body.sampleDetails) !== undefined ||
      str(body.sampleQuantity) !== undefined ||
      str(body.sampleWeight) !== undefined ||
      str(body.sampleRemarks) !== undefined;
    if (touchesSampleSpecsContent && order.sampleApprovedAt) {
      data.sampleSpecsAcknowledgedAt = null;
      data.sampleSpecsAcknowledgedById = null;
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No editable fields provided" }, { status: 400 });
    }
    const updated = await prisma.order.update({ where: { id: orderId }, data });
    return NextResponse.json({ ok: true, order: updated });
  }

  return NextResponse.json({ error: "You do not have permission to edit this enquiry." }, { status: 403 });
}
