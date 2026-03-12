import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { createOrderSchema } from "@/lib/validation";
import { createOrder } from "@/lib/order-engine";
import { getRateLimitIdentifier, rateLimit } from "@/lib/rate-limit";
import { cacheGet, cacheSet, cacheKeyOrdersList } from "@/lib/redis";

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

  const { searchParams } = new URL(req.url);
  const page = Number(searchParams.get("page")) || 1;
  const limit = Number(searchParams.get("limit")) || 20;
  const status = searchParams.get("status") || undefined;
  const divisionId = searchParams.get("divisionId") || undefined;
  const cacheKey = cacheKeyOrdersList(JSON.stringify({ page, limit, status, divisionId, role: auth.payload.role }));

  const cached = await cacheGet<{ orders: unknown[]; total: number }>(cacheKey);
  if (cached) return NextResponse.json(cached);

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (divisionId) where.currentDivisionId = Number(divisionId);
  if (auth.payload.role === "USER") where.createdById = Number(auth.payload.sub);
  if (auth.payload.role === "MANAGER" || auth.payload.role === "SUPERVISOR") {
    if (auth.payload.divisionId) where.currentDivisionId = auth.payload.divisionId;
  }

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: orderInclude,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.order.count({ where }),
  ]);

  const result = { orders, total, page, limit };
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
  const order = await createOrder(Number(auth.payload.sub), parsed.data.divisionId, {
    companyName: parsed.data.companyName,
    description: parsed.data.description,
    customFields: parsed.data.customFields,
  });
  return NextResponse.json(order, { status: 201 });
}
