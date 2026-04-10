import { NextResponse } from "next/server";
import { withRole } from "@/lib/with-auth";
import { slaHeadRejectionSchema } from "@/lib/validation";
import { submitSlaHeadRejection } from "@/lib/order-engine";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await withRole(["MANAGER", "SUPER_ADMIN"]);
  if (auth.response) return auth.response;

  const id = Number((await params).id);
  const body = await req.json().catch(() => null);
  const parsed = slaHeadRejectionSchema.safeParse({
    orderId: id,
    message: body?.message,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const result = await submitSlaHeadRejection(
    parsed.data.orderId,
    Number(auth.payload.sub),
    parsed.data.message,
    { bypassHeadCheck: auth.payload.role === "SUPER_ADMIN" }
  );

  if (!result) {
    return NextResponse.json(
      { error: "No open SLA breach found, or you are not the Division Head for this enquiry." },
      { status: 400 }
    );
  }

  return NextResponse.json(result);
}

