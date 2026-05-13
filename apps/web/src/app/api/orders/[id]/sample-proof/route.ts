/**
 * POST /api/orders/[id]/sample-proof
 *
 * Sample courier-proof upload. Per user spec the file is NOT written to disk under
 * `public/uploads/…` — it's encoded as a base64 data URI and stored inside the
 * order row (`sampleProofUrl`). The matching GET endpoint at
 * /api/orders/[id]/sample-proof streams it back out with the right MIME type.
 *
 * Body: multipart/form-data, single field `file` (PDF / JPG / PNG / WEBP, ≤ 5 MB)
 */
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { prisma } from "@/lib/db";
import { userCanManageSampleForOrder } from "@/lib/order-sample-actions";
import { Prisma } from "@prisma/client";
import path from "path";

export const runtime = "nodejs";

const MIME_MAP: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await withAuth();
    if (auth.response) return auth.response;

    const id = Number((await params).id);
    if (!Number.isInteger(id)) {
      return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
    }

    const order = await prisma.order.findUnique({
      where: { id },
      select: { id: true, currentDivisionId: true, createdById: true, sampleRequested: true },
    });
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    if (!order.sampleRequested) {
      return NextResponse.json({ error: "Sample not requested for this enquiry" }, { status: 400 });
    }

    const userId = Number(auth.payload.sub);
    const ok = await userCanManageSampleForOrder(userId, auth.payload.role, order.currentDivisionId);
    if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const form = await req.formData().catch(() => null);
    if (!form) return NextResponse.json({ error: "Invalid form data" }, { status: 400 });

    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    if (file.size <= 0) return NextResponse.json({ error: "Empty file" }, { status: 400 });

    const maxBytes = 5 * 1024 * 1024;
    if (file.size > maxBytes) {
      return NextResponse.json({ error: "File too large (max 5 MB)" }, { status: 400 });
    }

    const safeName = path
      .basename(file.name)
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .slice(0, 80);
    const ext = path.extname(safeName).toLowerCase();
    const mime = MIME_MAP[ext];
    if (!mime) {
      return NextResponse.json(
        { error: "Unsupported file type (allowed: PDF, PNG, JPG, WEBP)" },
        { status: 400 }
      );
    }

    // Encode inline — NO disk write. Matches the GST upload convention.
    const buf = await file.arrayBuffer();
    const base64 = Buffer.from(buf).toString("base64");
    const dataUrl = `data:${mime};base64,${base64}`;
    const stored = JSON.stringify({ url: dataUrl, name: file.name });

    await prisma.order.update({
      where: { id },
      data: { sampleProofUrl: stored },
    });

    return NextResponse.json({ url: dataUrl, name: file.name });
  } catch (err) {
    console.error("[sample-proof upload]", err);
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2022") {
      return NextResponse.json(
        {
          error:
            "Database schema is out of date (missing sample proof columns). Run migrations: cd apps/web && npx prisma migrate deploy",
          code: "SCHEMA_DRIFT",
        },
        { status: 503 }
      );
    }
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        error: "Failed to upload proof",
        detail: process.env.NODE_ENV === "development" ? msg : undefined,
      },
      { status: 500 }
    );
  }
}
