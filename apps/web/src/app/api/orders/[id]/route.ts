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
  let order;
  try {
    order = await prisma.order.findUnique({
      where: { id },
      include: fullInclude,
    });
  } catch (err) {
    console.error("[GET /api/orders/[id]]", err);
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2022") {
      return NextResponse.json(
        {
          error:
            "Database is missing required columns (sample workflow / schema update). From apps/web run: npx prisma migrate deploy",
          code: "SCHEMA_DRIFT",
        },
        { status: 503 }
      );
    }
    const msg = err instanceof Error ? err.message : String(err);
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P1001"
    ) {
      // One quick retry for flaky pooler disconnects.
      try {
        await new Promise((r) => setTimeout(r, 450));
        order = await prisma.order.findUnique({
          where: { id },
          include: fullInclude,
        });
        if (order) {
          // continue below (permission check + return)
        } else {
          return NextResponse.json({ error: "Enquiry not found" }, { status: 404 });
        }
      } catch (retryErr) {
        const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
        return NextResponse.json(
          {
            error: "Database unavailable. Please retry.",
            code: "DB_UNAVAILABLE",
            detail: process.env.NODE_ENV === "development" ? retryMsg : undefined,
          },
          { status: 503 }
        );
      }
    }
    if (/column/i.test(msg) && /does not exist/i.test(msg)) {
      return NextResponse.json(
        {
          error:
            "Database schema is out of date. Run migrations: cd apps/web && npx prisma migrate deploy",
          code: "SCHEMA_DRIFT",
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

  // ── Division Head: edit handoff / notes ───────────────────────────────────
  if (["MANAGER", "DIVISION_HEAD"].includes(role)) {
    const managed = await prisma.divisionManager.findFirst({
      where: { userId, divisionId: order.currentDivisionId },
    });
    const adminBypass = ["SUPER_ADMIN", "MANAGING_DIRECTOR"].includes(role);
    if (!managed && !adminBypass) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const data: Record<string, unknown> = {};
    if (str(body.acceptanceReason) !== undefined) data.acceptanceReason = str(body.acceptanceReason) || null;
    if (body.enquiryHandoff !== undefined && typeof body.enquiryHandoff === "object") {
      const existing = (await prisma.order.findUnique({ where: { id: orderId }, select: { enquiryHandoff: true } }))?.enquiryHandoff as Record<string, unknown> | null ?? {};
      data.enquiryHandoff = { ...existing, ...(body.enquiryHandoff as Record<string, unknown>) };
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
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No editable fields provided" }, { status: 400 });
    }
    const updated = await prisma.order.update({ where: { id: orderId }, data });
    return NextResponse.json({ ok: true, order: updated });
  }

  return NextResponse.json({ error: "You do not have permission to edit this enquiry." }, { status: 403 });
}
