import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logAudit, notify, salesInDivision, superAdminIds } from "@/lib/activity";
import { accessibleDivisionIds, withAuth } from "@/lib/with-auth";
import { getScopedOrder } from "@/lib/orders";
import { updateOrderSchema } from "@/lib/validation";
import { appendTimeline } from "@/lib/timeline";
import { canCreateEnquiry } from "@/lib/roles";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const auth = await withAuth();
  if (auth.response) return auth.response;
  const id = Number((await ctx.params).id);
  const visible = await getScopedOrder(id, auth.payload);
  if (!visible) return NextResponse.json({ error: "Enquiry not found" }, { status: 404 });
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      division: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      assignedTo: { select: { id: true, name: true } },
      pricedBy: { select: { id: true, name: true } },
      timelineEvents: {
        orderBy: { createdAt: "desc" },
        include: { actor: { select: { name: true, role: true } } },
      },
    },
  });
  // The submitted (entered) date is for the Super admin only.
  if (order && auth.payload.role !== "SUPER_ADMIN") {
    const { createdAt: _hidden, ...rest } = order;
    void _hidden;
    return NextResponse.json({ order: rest });
  }
  return NextResponse.json({ order });
}

/** Marketing corrects the enquiry details while it is still open. */
export async function PATCH(req: Request, ctx: Ctx) {
  const auth = await withAuth();
  if (auth.response) return auth.response;
  if (!canCreateEnquiry(auth.payload.role)) return NextResponse.json({ error: "Only Marketing can edit enquiry details" }, { status: 403 });
  const id = Number((await ctx.params).id);
  const existing = await getScopedOrder(id, auth.payload);
  if (!existing) return NextResponse.json({ error: "Enquiry not found" }, { status: 404 });
  if (existing.status === "CLOSED" || existing.status === "CANCELLED") {
    return NextResponse.json({ error: "This enquiry is finished and can't be edited" }, { status: 409 });
  }
  const parsed = updateOrderSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const d = parsed.data;
  if (d.divisionId && d.divisionId !== existing.divisionId) {
    const allowed = await accessibleDivisionIds(auth.payload);
    if (allowed !== null && !allowed.includes(d.divisionId)) {
      return NextResponse.json({ error: "You don't have access to that division" }, { status: 403 });
    }
  }
  const blank = (v: string | undefined) => (v === undefined ? undefined : v.trim() === "" ? null : v.trim());
  const order = await prisma.order.update({
    where: { id },
    data: {
      ...(d.enquiryDate ? { enquiryDate: new Date(d.enquiryDate) } : {}),
      ...(d.customerName ? { customerName: d.customerName.trim() } : {}),
      companyName: blank(d.companyName),
      customerPhone: blank(d.customerPhone),
      customerEmail: blank(d.customerEmail),
      customerAddress: blank(d.customerAddress),
      gstNumber: blank(d.gstNumber),
      ...(d.gstCopyUrl !== undefined ? { gstCopyUrl: d.gstCopyUrl || null } : {}),
      ...(d.divisionId ? { divisionId: d.divisionId } : {}),
      ...(d.productDetails ? { productDetails: d.productDetails.trim() } : {}),
      ...(d.isSample !== undefined ? { isSample: d.isSample } : {}),
    },
  });
  await appendTimeline({ orderId: id, type: "ENQUIRY_EDITED", title: "Enquiry details edited", actorId: Number(auth.payload.sub) });
  await logAudit({ actor: auth.payload, action: "ENQUIRY_EDITED", category: "ENQUIRY", entityType: "Order", entityId: id, entityLabel: existing.orderNumber, req });
  return NextResponse.json(order);
}

/** Super admin only: permanently delete an enquiry and its history. */
export async function DELETE(_req: Request, ctx: Ctx) {
  const auth = await withAuth();
  if (auth.response) return auth.response;
  if (auth.payload.role !== "SUPER_ADMIN") return NextResponse.json({ error: "Only the Super admin can delete enquiries" }, { status: 403 });
  const id = Number((await ctx.params).id);
  const found = await prisma.order.findUnique({ where: { id }, select: { id: true } });
  if (!found) return NextResponse.json({ error: "Enquiry not found" }, { status: 404 });
  const label = (await prisma.order.findUnique({ where: { id }, select: { orderNumber: true, companyName: true, customerName: true } }))!;
  await prisma.order.delete({ where: { id } });
  await logAudit({ actor: auth.payload, action: "ENQUIRY_DELETED", category: "ENQUIRY", entityType: "Order", entityId: id, entityLabel: label.orderNumber, detail: label.companyName || label.customerName, req: _req });
  return NextResponse.json({ ok: true });
}
