import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyIntegrationSecret } from "@/lib/integration-auth";
import { getIntegrationActorUserId, runSampleAction } from "@/lib/order-sample-actions";

/**
 * n8n → OMS: update sample workflow after human-in-the-loop steps.
 * Header: X-Integration-Secret: $N8N_INTEGRATION_SECRET
 * Body: same as POST /api/orders/:id/sample (discriminated action).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!verifyIntegrationSecret(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const id = Number((await params).id);
    if (!Number.isInteger(id)) {
      return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
    }
    const exists = await prisma.order.findUnique({ where: { id }, select: { id: true } });
    if (!exists) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    const actorId = await getIntegrationActorUserId();
    if (!actorId) {
      return NextResponse.json(
        { error: "Set N8N_INTEGRATION_USER_ID or ensure a Super Admin user exists" },
        { status: 503 }
      );
    }

    const body = await req.json().catch(() => ({}));
    return await runSampleAction(id, actorId, body);
  } catch (err) {
    console.error("[api/integration/orders/:id] 500", err);
    return NextResponse.json(
      { error: "Internal server error", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
