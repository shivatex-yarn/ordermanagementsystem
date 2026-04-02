import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { Prisma, type OrderStatus } from "@prisma/client";
import { createOrderSchema } from "@/lib/validation";
import { createOrder } from "@/lib/order-engine";
import { getRateLimitIdentifierForUser, rateLimit } from "@/lib/rate-limit";
import { getCreatedAtRange, normalizePeriodParam, parseCreatedAtRangeFromParams } from "@/lib/date-period";
import { userMayRouteEnquiryToDivision } from "@/lib/division-access";
import { timingHeaderValue, withTiming } from "@/lib/server-timing";

/**
 * Keep list payload small: the Orders page only needs id, number, status, createdAt,
 * division name, and (optionally) submitter name/email.
 * Heavy relations belong in /api/orders/:id only.
 */
const orderListSelect = {
  id: true,
  orderNumber: true,
  status: true,
  createdAt: true,
  currentDivision: { select: { name: true } },
  createdBy: { select: { name: true, email: true } },
} as const;

export async function GET(req: Request) {
  const marks: { name: string; durMs: number; desc?: string }[] = [];
  const auth = await withAuth();
  if (auth.response) return auth.response;
  const rl = await withTiming("ratelimit", () =>
    rateLimit(getRateLimitIdentifierForUser(req, Number(auth.payload.sub)))
  );
  marks.push(rl.mark);
  const { ok, remaining } = rl.value;
  if (!ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "X-RateLimit-Remaining": String(remaining) } }
    );
  }

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
    const p1 = withTiming("db_findMany", () =>
      prisma.order.findMany({
        where,
        select: orderListSelect,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      })
    );
    const p2 = withTiming("db_count", () => prisma.order.count({ where }));
    const results = await Promise.all([p1, p2]);
    marks.push(results[0].mark, results[1].mark);
    orders = results[0].value;
    total = results[1].value;
    if (wantStats) {
      const grp = await withTiming("db_groupBy", () =>
        prisma.order.groupBy({
          by: ["status"],
          where,
          _count: { _all: true },
        })
      );
      marks.push(grp.mark);
      const grouped = grp.value;
      statusCounts = Object.fromEntries(grouped.map((g) => [g.status, g._count._all])) as Record<string, number>;
    }
  } catch (err) {
    console.error("[GET /api/orders]", err);
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
  const res = NextResponse.json(result);
  res.headers.set("Server-Timing", timingHeaderValue(marks));
  return res;
}

export async function POST(req: Request) {
  const auth = await withAuth();
  if (auth.response) return auth.response;
  const { ok, remaining } = await rateLimit(
    getRateLimitIdentifierForUser(req, Number(auth.payload.sub))
  );
  if (!ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "X-RateLimit-Remaining": String(remaining) } }
    );
  }

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
