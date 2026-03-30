import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { cancelOrderSchema } from "@/lib/validation";
import { cancelOrderByCreator } from "@/lib/order-engine";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await withAuth();
  if (auth.response) return auth.response;
  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid enquiry id" }, { status: 400 });
  }
  const body = await req.json().catch(() => ({}));
  const parsed = cancelOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const userId = Number(auth.payload.sub);

  const existing = await prisma.order.findUnique({ where: { id }, select: { id: true, createdById: true } });
  if (!existing) return NextResponse.json({ error: "Enquiry not found" }, { status: 404 });
  if (existing.createdById !== userId) {
    return NextResponse.json({ error: "Only the person who raised this enquiry can cancel it." }, { status: 403 });
  }

  const updated = await cancelOrderByCreator(id, userId, parsed.data.reason);
  if (!updated) {
    return NextResponse.json(
      {
        error:
          "This enquiry cannot be cancelled. You can only withdraw while it is still Placed and before the division has taken action.",
      },
      { status: 400 }
    );
  }
  return NextResponse.json(updated);
}
