/**
 * GET /api/orders/[id] — full enquiry detail.
 *
 * Each part is fetched in its own try/catch so any one failing relation (missing
 * column, Prisma client mismatch, broken FK) degrades to `null` / `[]` instead of
 * killing the whole response with a 500.
 *
 * Real error messages still go to the server console; the response carries the
 * exact reason only in dev mode under `_partialFailures`.
 */
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { userCanViewOrder } from "@/lib/order-view-permission";
import { withAuth } from "@/lib/with-auth";

async function safe<T>(label: string, fn: () => Promise<T>, fallback: T, failures: Record<string, string>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    failures[label] = msg;
    console.error(`[GET /api/orders/[id]] ${label} failed:`, msg);
    return fallback;
  }
}

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

  const failures: Record<string, string> = {};

  // Step 1: bare order row — if this fails, the enquiry truly cannot load.
  let base;
  try {
    base = await prisma.order.findUnique({
      where: { id },
      // Use a wide-open select on scalar columns so the row always loads even when
      // optional relations differ between schema branches.
    });
  } catch (err) {
    console.error("[GET /api/orders/[id]] base findUnique failed:", err);
    const msg = err instanceof Error ? err.message : String(err);
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2022") {
      return NextResponse.json(
        {
          error:
            "Database is missing required columns. From apps/web run: npx prisma migrate deploy && npx prisma generate, then restart the dev server.",
          code: "SCHEMA_DRIFT",
          detail: process.env.NODE_ENV === "development" ? msg : undefined,
        },
        { status: 503 }
      );
    }
    if (/column/i.test(msg) && /does not exist/i.test(msg)) {
      return NextResponse.json(
        {
          error: "Database schema is out of date. Run: cd apps/web && npx prisma migrate deploy && npx prisma generate",
          code: "SCHEMA_DRIFT",
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
  if (!base) return NextResponse.json({ error: "Enquiry not found" }, { status: 404 });

  // Permission check — done BEFORE we run the side queries to avoid leaking data.
  if (
    !(await userCanViewOrder(auth.payload, {
      createdById: base.createdById,
      currentDivisionId: base.currentDivisionId,
      previousDivisionId: base.previousDivisionId,
    }))
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Step 2: independent enrichment queries — each failure is isolated.
  const [
    createdBy,
    currentDivision,
    previousDivision,
    acceptedBy,
    rejectedBy,
    receivedBy,
    completedBy,
    cancelledBy,
    sampleApprovedBy,
    slaBreaches,
    transfers,
    rejections,
    editHistory,
  ] = await Promise.all([
    safe("createdBy", () => prisma.user.findUnique({ where: { id: base.createdById }, select: { id: true, name: true, email: true } }), null, failures),
    safe("currentDivision", () => prisma.division.findUnique({ where: { id: base.currentDivisionId }, select: { id: true, name: true } }), null, failures),
    safe(
      "previousDivision",
      () =>
        base.previousDivisionId == null
          ? Promise.resolve(null)
          : prisma.division.findUnique({ where: { id: base.previousDivisionId }, select: { id: true, name: true } }),
      null,
      failures
    ),
    safe(
      "acceptedBy",
      () =>
        base.acceptedById == null
          ? Promise.resolve(null)
          : prisma.user.findUnique({ where: { id: base.acceptedById }, select: { id: true, name: true, email: true } }),
      null,
      failures
    ),
    safe(
      "rejectedBy",
      () =>
        base.rejectedById == null
          ? Promise.resolve(null)
          : prisma.user.findUnique({ where: { id: base.rejectedById }, select: { id: true, name: true, email: true } }),
      null,
      failures
    ),
    safe(
      "receivedBy",
      () =>
        base.receivedById == null
          ? Promise.resolve(null)
          : prisma.user.findUnique({ where: { id: base.receivedById }, select: { id: true, name: true, email: true } }),
      null,
      failures
    ),
    safe(
      "completedBy",
      () =>
        base.completedById == null
          ? Promise.resolve(null)
          : prisma.user.findUnique({ where: { id: base.completedById }, select: { id: true, name: true, email: true } }),
      null,
      failures
    ),
    safe(
      "cancelledBy",
      () =>
        base.cancelledById == null
          ? Promise.resolve(null)
          : prisma.user.findUnique({ where: { id: base.cancelledById }, select: { id: true, name: true, email: true } }),
      null,
      failures
    ),
    safe(
      "sampleApprovedBy",
      () =>
        base.sampleApprovedById == null
          ? Promise.resolve(null)
          : prisma.user.findUnique({ where: { id: base.sampleApprovedById }, select: { id: true, name: true, email: true } }),
      null,
      failures
    ),
    safe(
      "slaBreaches",
      () =>
        prisma.sLABreach.findMany({
          where: { orderId: id, resolvedAt: null },
          orderBy: { breachedAt: "desc" },
          take: 1,
          select: {
            id: true,
            breachedAt: true,
            headRejectedAt: true,
            headRejectionMessage: true,
            division: { select: { id: true, name: true } },
            headRejectedBy: { select: { id: true, name: true, email: true } },
          },
        }),
      [],
      failures
    ),
    safe(
      "transfers",
      () =>
        prisma.orderTransfer.findMany({
          where: { orderId: id },
          orderBy: { createdAt: "desc" },
          take: 25,
          select: {
            id: true,
            createdAt: true,
            reason: true,
            fromDivision: { select: { id: true, name: true } },
            toDivision: { select: { id: true, name: true } },
            transferredBy: { select: { id: true, name: true, email: true } },
          },
        }),
      [],
      failures
    ),
    safe(
      "rejections",
      () =>
        prisma.orderRejection.findMany({
          where: { orderId: id },
          orderBy: { createdAt: "desc" },
          take: 25,
          select: {
            id: true,
            createdAt: true,
            reason: true,
            division: { select: { id: true, name: true } },
            rejectedBy: { select: { id: true, name: true, email: true } },
          },
        }),
      [],
      failures
    ),
    safe(
      "editHistory",
      () =>
        prisma.orderEditHistory.findMany({
          where: { orderId: id },
          orderBy: { createdAt: "desc" },
          take: 25,
          select: {
            id: true,
            createdAt: true,
            fieldName: true,
            oldValue: true,
            newValue: true,
            user: { select: { id: true, name: true, email: true } },
          },
        }),
      [],
      failures
    ),
  ]);

  const response = {
    ...base,
    createdBy,
    currentDivision,
    previousDivision,
    acceptedBy,
    rejectedBy,
    receivedBy,
    completedBy,
    cancelledBy,
    sampleApprovedBy,
    slaBreaches,
    transfers,
    rejections,
    editHistory,
    ...(process.env.NODE_ENV === "development" && Object.keys(failures).length
      ? { _partialFailures: failures }
      : {}),
  };

  const res = NextResponse.json(response);
  res.headers.set("Cache-Control", "private, max-age=5, stale-while-revalidate=20");
  return res;
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
