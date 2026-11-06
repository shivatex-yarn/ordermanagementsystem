import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
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
  return NextResponse.json({ order });
}

/** Marketing corrects the enquiry details. */
export async function PATCH(req: Request, ctx: Ctx) {
  const auth = await withAuth();
  if (auth.response) return auth.response;
  if (!canCreateEnquiry(auth.payload.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = Number((await ctx.params).id);
  if (!(await getScopedOrder(id, auth.payload))) {
    return NextResponse.json({ error: "Enquiry not found" }, { status: 404 });
  }
  const parsed = updateOrderSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const { enquiryDate, customerEmail, ...rest } = parsed.data;
  const order = await prisma.order.update({
    where: { id },
    data: {
      ...rest,
      ...(enquiryDate ? { enquiryDate: new Date(enquiryDate) } : {}),
      ...(customerEmail !== undefined ? { customerEmail: customerEmail || null } : {}),
    },
  });
  await appendTimeline({ orderId: id, type: "ENQUIRY_EDITED", title: "Details updated", actorId: Number(auth.payload.sub) });
  return NextResponse.json(order);
}
