import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { withAuth, accessibleDivisionIds } from "@/lib/with-auth";
import { createOrderSchema } from "@/lib/validation";
import { canCreateEnquiry } from "@/lib/roles";
import { createOrderRow, orderListSelect, scopeWhere } from "@/lib/orders";
import { appendTimeline } from "@/lib/timeline";

/** List enquiries the person can see. Filters: status, divisionId, q (search), mine=1. */
export async function GET(req: Request) {
  const auth = await withAuth();
  if (auth.response) return auth.response;
  const sp = new URL(req.url).searchParams;
  const where: Prisma.OrderWhereInput = { ...(await scopeWhere(auth.payload)) };

  const status = sp.get("status");
  if (status && ["PLACED", "PRICED", "CLOSED", "CANCELLED"].includes(status)) where.status = status as never;
  const divisionId = Number(sp.get("divisionId"));
  if (divisionId) where.divisionId = divisionId;
  if (sp.get("mine") === "1") {
    const me = Number(auth.payload.sub);
    where.OR = [{ createdById: me }, { assignedToId: me }];
  }
  const q = sp.get("q")?.trim();
  if (q) {
    where.AND = [
      {
        OR: [
          { customerName: { contains: q, mode: "insensitive" } },
          { companyName: { contains: q, mode: "insensitive" } },
          { orderNumber: { contains: q, mode: "insensitive" } },
          { productDetails: { contains: q, mode: "insensitive" } },
        ],
      },
    ];
  }

  const scope = await scopeWhere(auth.payload);
  const [orders, counts] = await Promise.all([
    prisma.order.findMany({ where, orderBy: { enquiryDate: "desc" }, take: 300, select: orderListSelect }),
    prisma.order.groupBy({ by: ["status"], where: scope, _count: { _all: true } }),
  ]);
  const byStatus = Object.fromEntries(counts.map((c) => [c.status, c._count._all]));
  return NextResponse.json({ orders, counts: byStatus });
}

/** Marketing logs a new enquiry. Phone is optional. */
export async function POST(req: Request) {
  const auth = await withAuth();
  if (auth.response) return auth.response;
  if (!canCreateEnquiry(auth.payload.role)) {
    return NextResponse.json({ error: "Only Marketing can log enquiries" }, { status: 403 });
  }
  const parsed = createOrderSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const d = parsed.data;
  const allowed = await accessibleDivisionIds(auth.payload);
  if (allowed !== null && !allowed.includes(d.divisionId)) {
    return NextResponse.json(
      { error: "You don't have access to that division. Request access from the admin." },
      { status: 403 }
    );
  }
  const enquiryDate = new Date(d.enquiryDate);
  if (Number.isNaN(enquiryDate.getTime())) {
    return NextResponse.json({ error: "Enquiry date is not valid" }, { status: 400 });
  }
  const order = await createOrderRow({
    enquiryDate,
    customerName: d.customerName,
    companyName: d.companyName ?? null,
    customerPhone: d.customerPhone ?? null,
    customerEmail: d.customerEmail || null,
    customerAddress: d.customerAddress ?? null,
    gstNumber: d.gstNumber ?? null,
    gstCopyUrl: d.gstCopyUrl ?? null,
    divisionId: d.divisionId,
    productDetails: d.productDetails,
    isSample: d.isSample,
    assignedToId: d.assignedToId ?? null,
    createdById: Number(auth.payload.sub),
  });
  await appendTimeline({
    orderId: order.id,
    type: "ENQUIRY_CREATED",
    title: "Enquiry logged",
    detail: d.isSample ? "Client wants a sample." : null,
    actorId: Number(auth.payload.sub),
  });
  return NextResponse.json(order, { status: 201 });
}
