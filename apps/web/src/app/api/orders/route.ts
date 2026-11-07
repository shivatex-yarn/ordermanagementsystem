import { NextResponse, after } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logAudit, notify, salesInDivision, superAdminIds } from "@/lib/activity";
import { sendEnquiryCreatedEmails } from "@/lib/email-enquiry";
import { withAuth, accessibleDivisionIds } from "@/lib/with-auth";
import { createOrderSchema } from "@/lib/validation";
import { canCreateEnquiry } from "@/lib/roles";
import { createOrderRow, orderListSelect } from "@/lib/orders";
import { buildOrderWhere } from "@/lib/order-filters";
import { appendTimeline } from "@/lib/timeline";

const DEFAULT_PAGE_SIZE = 10;

/** List enquiries the person can see. Filters: status, divisionId, from, to (enquiry date), q (search), mine=1. Paged by 10 (or 5 with pageSize=5). */
export async function GET(req: Request) {
  const auth = await withAuth();
  if (auth.response) return auth.response;
  const sp = new URL(req.url).searchParams;
  const { base, where } = await buildOrderWhere(sp, auth.payload);

  const PAGE_SIZE = [5, 10].includes(Number(sp.get("pageSize"))) ? Number(sp.get("pageSize")) : DEFAULT_PAGE_SIZE;
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const [orders, total, counts] = await Promise.all([
    prisma.order.findMany({ where, orderBy: [{ enquiryDate: "desc" }, { id: "desc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, select: orderListSelect }),
    prisma.order.count({ where }),
    prisma.order.groupBy({ by: ["status"], where: base, _count: { _all: true } }),
  ]);
  const byStatus = Object.fromEntries(counts.map((c) => [c.status, c._count._all]));
  return NextResponse.json({ orders, total, page, pageSize: PAGE_SIZE, counts: byStatus });
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
  const me = Number(auth.payload.sub);
  await logAudit({ actor: auth.payload, action: "ENQUIRY_CREATED", category: "ENQUIRY", entityType: "Order", entityId: order.id, entityLabel: order.orderNumber, detail: `${d.companyName || d.customerName}${d.isSample ? " · sample" : ""}`, req });
  void notify(await salesInDivision(d.divisionId), { type: "ENQUIRY_NEW", title: `New enquiry ${order.orderNumber}`, body: `${d.companyName || d.customerName} needs pricing${d.isSample ? " (sample requested)" : ""}.`, link: `/orders/${order.id}` }, me);
  void notify(await superAdminIds(), { type: "ENQUIRY_NEW", title: `New enquiry ${order.orderNumber}`, body: `${d.companyName || d.customerName} logged by ${auth.payload.email}.`, link: `/orders/${order.id}` }, me);
  // Email the Super admin(s) and the person who logged it, after the response has gone out.
  after(() => sendEnquiryCreatedEmails(order.id));
  return NextResponse.json(order, { status: 201 });
}
