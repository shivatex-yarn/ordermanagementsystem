import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { Prisma, type OrderStatus } from "@prisma/client";
import { createOrderSchema } from "@/lib/validation";
import { createOrder } from "@/lib/order-engine";
import { getRateLimitIdentifier, rateLimit } from "@/lib/rate-limit";
import { cacheGet, cacheSet, cacheKeyOrdersList } from "@/lib/redis";
import { getCreatedAtRange, normalizePeriodParam, parseCreatedAtRangeFromParams } from "@/lib/date-period";
import { userMayRouteEnquiryToDivision } from "@/lib/division-access";

function safeDbHint() {
  try {
    const url = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
    if (!url) return { hasDbUrl: false };
    return {
      hasDbUrl: true,
      host: url.host,
      db: url.pathname?.replace(/^\//, "") || undefined,
      schema: url.searchParams.get("schema") || undefined,
    };
  } catch {
    return { hasDbUrl: Boolean(process.env.DATABASE_URL) };
  }
}

const orderInclude = {
  createdBy: { select: { id: true, name: true, email: true } },
  currentDivision: { select: { id: true, name: true } },
  previousDivision: { select: { id: true, name: true } },
  acceptedBy: { select: { id: true, name: true, email: true } },
  rejectedBy: { select: { id: true, name: true, email: true } },
  receivedBy: { select: { id: true, name: true, email: true } },
  completedBy: { select: { id: true, name: true, email: true } },
};

export async function GET(req: Request) {
  const auth = await withAuth();
  if (auth.response) return auth.response;
  const { ok } = rateLimit(getRateLimitIdentifier(req));
  if (!ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  // #region agent log
  fetch("http://127.0.0.1:7328/ingest/3b6d6cf8-0b13-4001-8f24-c47cea3cb28e", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "9f4942" },
    body: JSON.stringify({
      sessionId: "9f4942",
      runId: "post-fix",
      hypothesisId: "H_env_db_mismatch",
      location: "apps/web/src/app/api/orders/route.ts:GET",
      message: "orders list request",
      data: { role: auth.payload.role, db: safeDbHint() },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  const { searchParams } = new URL(req.url);
  const page = Number(searchParams.get("page")) || 1;
  const limit = Number(searchParams.get("limit")) || 20;
  const status = searchParams.get("status") || undefined;
  const divisionId = searchParams.get("divisionId") || undefined;
  const period = normalizePeriodParam(searchParams.get("period"));
  const dateFrom = searchParams.get("from")?.trim() || null;
  const dateTo = searchParams.get("to")?.trim() || null;
  const customCreatedRange = parseCreatedAtRangeFromParams(dateFrom, dateTo);
  const wantStats = searchParams.get("stats") === "1";
  const cacheKey = cacheKeyOrdersList(
    JSON.stringify({
      page,
      limit,
      status,
      divisionId,
      role: auth.payload.role,
      period: customCreatedRange ? "" : period,
      wantStats,
      from: dateFrom ?? "",
      to: dateTo ?? "",
    })
  );

  const cached = await cacheGet<{ orders: unknown[]; total: number; statusCounts?: Record<string, number> }>(
    cacheKey
  );
  if (cached) return NextResponse.json(cached);

  const where: Prisma.OrderWhereInput = {};
  if (status) where.status = status as OrderStatus;
  if (divisionId) where.currentDivisionId = Number(divisionId);
  if (customCreatedRange) {
    where.createdAt = { gte: customCreatedRange.gte, lte: customCreatedRange.lte };
  } else {
    const createdRange = getCreatedAtRange(period);
    if (createdRange) {
      where.createdAt = { gte: createdRange.gte, lte: createdRange.lte };
    }
  }
  if (auth.payload.role === "USER") where.createdById = Number(auth.payload.sub);
  if (auth.payload.role === "MANAGER" || auth.payload.role === "SUPERVISOR") {
    const userId = Number(auth.payload.sub);
    const managed = await prisma.divisionManager.findMany({
      where: { userId },
      select: { divisionId: true },
    });
    const accessibleDivisionIds = Array.from(
      new Set([auth.payload.divisionId ?? null, ...managed.map((m) => m.divisionId)].filter((v): v is number => typeof v === "number"))
    );
    if (accessibleDivisionIds.length > 0) {
      // Only list enquiries for divisions the manager/supervisor is mapped to.
      where.currentDivisionId = { in: accessibleDivisionIds };
    } else {
      // No division mapping → no enquiries.
      where.currentDivisionId = -1;
    }
  }
  // SUPER_ADMIN and MANAGING_DIRECTOR see all (no extra filter)

  let orders: unknown[] = [];
  let total = 0;
  let statusCounts: Record<string, number> | undefined;
  try {
    [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: orderInclude,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.order.count({ where }),
    ]);
    if (wantStats) {
      const grouped = await prisma.order.groupBy({
        by: ["status"],
        where,
        _count: { _all: true },
      });
      statusCounts = Object.fromEntries(grouped.map((g) => [g.status, g._count._all])) as Record<string, number>;
    }
  } catch (err) {
    console.error("[GET /api/orders]", err);
    // #region agent log
    fetch("http://127.0.0.1:7328/ingest/3b6d6cf8-0b13-4001-8f24-c47cea3cb28e", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "9f4942" },
      body: JSON.stringify({
        sessionId: "9f4942",
        runId: "post-fix",
        hypothesisId: "H_db_schema_drift",
        location: "apps/web/src/app/api/orders/route.ts:catch",
        message: "orders list failed",
        data: {
          prismaCode:
            err instanceof Prisma.PrismaClientKnownRequestError ? err.code : undefined,
          errMsg: err instanceof Error ? err.message : String(err),
          db: safeDbHint(),
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
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
    return NextResponse.json({ error: "Failed to load enquiries" }, { status: 500 });
  }

  const result = { orders, total, page, limit, ...(statusCounts != null ? { statusCounts } : {}) };
  await cacheSet(cacheKey, result, 60);
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const auth = await withAuth();
  if (auth.response) return auth.response;
  const { ok } = rateLimit(getRateLimitIdentifier(req));
  if (!ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const body = await req.json();
  const parsed = createOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const canCreate = ["USER", "SUPERVISOR", "SUPER_ADMIN"].includes(auth.payload.role);
  if (!canCreate) {
    return NextResponse.json({ error: "Only users and supervisors can create enquiries" }, { status: 403 });
  }
  const userId = Number(auth.payload.sub);
  const mayUseDivision = await userMayRouteEnquiryToDivision(userId, auth.payload.role, parsed.data.divisionId);
  if (!mayUseDivision) {
    return NextResponse.json(
      { error: "You can only raise enquiries for division(s) you are assigned to." },
      { status: 403 }
    );
  }
  const order = await createOrder(userId, parsed.data.divisionId, {
    companyName: parsed.data.companyName,
    description: parsed.data.description,
    customFields: parsed.data.customFields,
    sampleRequested: parsed.data.sampleRequested,
    sampleRequestNotes: parsed.data.sampleRequestNotes,
  });
  return NextResponse.json(order, { status: 201 });
}
