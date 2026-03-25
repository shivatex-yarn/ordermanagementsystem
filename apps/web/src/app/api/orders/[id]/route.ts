import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { updateOrderSchema } from "@/lib/validation";
import { updateOrderWithEditHistory } from "@/lib/order-engine";
import { cacheGet, cacheSet, cacheKeyOrder } from "@/lib/redis";

const fullInclude = {
  createdBy: { select: { id: true, name: true, email: true } },
  currentDivision: { select: { id: true, name: true } },
  previousDivision: { select: { id: true, name: true } },
  acceptedBy: { select: { id: true, name: true, email: true } },
  rejectedBy: { select: { id: true, name: true, email: true } },
  receivedBy: { select: { id: true, name: true, email: true } },
  completedBy: { select: { id: true, name: true, email: true } },
  sampleApprovedBy: { select: { id: true, name: true, email: true } },
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
  comments: { include: { user: { select: { id: true, name: true, email: true } } } },
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
    return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
  }
  const cached = await cacheGet<unknown>(cacheKeyOrder(id));
  if (cached) return NextResponse.json(cached);

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
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  if (auth.payload.role === "USER" && order.createdById !== Number(auth.payload.sub)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (["MANAGER", "SUPERVISOR"].includes(auth.payload.role)) {
    const userId = Number(auth.payload.sub);
    if (order.createdById !== userId) {
      const managed = await prisma.divisionManager.findMany({
        where: { userId },
        select: { divisionId: true },
      });
      const accessibleDivisionIds = Array.from(
        new Set([auth.payload.divisionId ?? null, ...managed.map((m) => m.divisionId)].filter((v): v is number => typeof v === "number"))
      );
      const canView =
        accessibleDivisionIds.includes(order.currentDivisionId) ||
        (order.previousDivisionId != null && accessibleDivisionIds.includes(order.previousDivisionId));
      if (!canView && auth.payload.role !== "SUPER_ADMIN" && auth.payload.role !== "MANAGING_DIRECTOR") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
  }
  // MANAGING_DIRECTOR and SUPER_ADMIN can view any enquiry

  await cacheSet(cacheKeyOrder(id), order, 120);
  return NextResponse.json(order);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await withAuth();
  if (auth.response) return auth.response;
  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
  }
  const body = await req.json();
  const parsed = updateOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const canEdit = auth.payload.role === "SUPER_ADMIN" || auth.payload.role === "USER";
  if (!canEdit) {
    return NextResponse.json({ error: "Only the creator or Super Admin can edit an enquiry" }, { status: 403 });
  }
  const userId = Number(auth.payload.sub);
  const isSuperAdmin = auth.payload.role === "SUPER_ADMIN";
  const order = await updateOrderWithEditHistory(
    id,
    userId,
    {
      companyName: parsed.data.companyName,
      description: parsed.data.description,
      customFields: parsed.data.customFields,
    },
    isSuperAdmin
  );
  if (!order) {
    return NextResponse.json(
      { error: "Order not found or cannot be edited (only when status is Placed, by creator)" },
      { status: 400 }
    );
  }
  return NextResponse.json(order);
}
