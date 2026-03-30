import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { orderViewFieldsFromUnknown, userCanViewOrder } from "@/lib/order-view-permission";
import { withAuth } from "@/lib/with-auth";
import { cacheGet, cacheSet, cacheKeyOrder } from "@/lib/redis";

const fullInclude = {
  createdBy: { select: { id: true, name: true, email: true } },
  currentDivision: { select: { id: true, name: true } },
  cancelledBy: { select: { id: true, name: true, email: true } },
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
    return NextResponse.json({ error: "Invalid enquiry id" }, { status: 400 });
  }
  const cached = await cacheGet<unknown>(cacheKeyOrder(id));
  if (cached) {
    const fields = orderViewFieldsFromUnknown(cached);
    if (fields) {
      if (!(await userCanViewOrder(auth.payload, fields))) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return NextResponse.json(cached);
    }
    // Malformed cache entry — ignore and load from DB.
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

  await cacheSet(cacheKeyOrder(id), order, 180);
  return NextResponse.json(order);
}

export async function PATCH() {
  return NextResponse.json(
    {
      error:
        "Enquiries cannot be edited. If you need to correct details before the division acts, cancel this enquiry (withdraw) with a reason and submit a new one.",
    },
    { status: 403 }
  );
}
