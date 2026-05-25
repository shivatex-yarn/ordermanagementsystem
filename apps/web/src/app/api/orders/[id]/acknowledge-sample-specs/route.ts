import { NextResponse } from "next/server";
import { acknowledgeSampleSpecsBySales } from "@/lib/order-engine";
import { userCanViewOrder } from "@/lib/order-view-permission";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await withAuth();
  if (auth.response) return auth.response;
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) {
    return NextResponse.json({ error: "Invalid enquiry id" }, { status: 400 });
  }
  try {
    const orderRow = await prisma.order.findUnique({
      where: { id },
      select: { id: true, createdById: true, currentDivisionId: true, previousDivisionId: true },
    });
    if (!orderRow) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const canView = await userCanViewOrder(auth.payload, orderRow);
    if (!canView) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const updated = await acknowledgeSampleSpecsBySales(id, Number(auth.payload.sub));
    if (!updated) {
      return NextResponse.json(
        {
          error:
            "Cannot confirm review (you must be the enquiry submitter, sample specifications must be head-approved, and acknowledgement must not already be recorded).",
        },
        { status: 400 }
      );
    }
    return NextResponse.json(updated);
  } catch (err) {
    console.error("[acknowledge-sample-specs] unexpected error:", err);
    return NextResponse.json({ error: "Failed to acknowledge. Please try again." }, { status: 500 });
  }
}
