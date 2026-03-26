import { NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { prisma } from "@/lib/db";
import { userCanManageSampleForOrder } from "@/lib/order-sample-actions";
import { Prisma } from "@prisma/client";
import path from "path";
import { promises as fs } from "fs";

export const runtime = "nodejs";

function safeDbHint() {
  try {
    const url = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
    if (!url) return { hasDbUrl: false };
    return {
      hasDbUrl: true,
      host: url.host,
      db: url.pathname?.replace(/^\//, "") || undefined,
      schema: url.searchParams.get("schema") || undefined,
    };
  } catch {
    return { hasDbUrl: Boolean(process.env.DATABASE_URL) };
  }
}

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
      return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 400 });
    }

    const safeName = path
      .basename(file.name)
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .slice(0, 80);
    const ext = path.extname(safeName).toLowerCase();
    const allowed = new Set([".png", ".jpg", ".jpeg", ".webp", ".pdf"]);
    if (!allowed.has(ext)) {
      return NextResponse.json(
        { error: "Unsupported file type (allowed: png, jpg, webp, pdf)" },
        { status: 400 }
      );
    }

    const ts = Date.now();
    const filename = `order-${id}-${ts}${ext}`;
    const relUrl = `/uploads/samples/${filename}`;

    const uploadDir = path.join(process.cwd(), "public", "uploads", "samples");
    await fs.mkdir(uploadDir, { recursive: true });

    const arrayBuffer = await file.arrayBuffer();
    await fs.writeFile(path.join(uploadDir, filename), Buffer.from(arrayBuffer));

    await prisma.order.update({
      where: { id },
      data: { sampleProofUrl: relUrl },
    });

    return NextResponse.json({ url: relUrl });
  } catch (err) {
    console.error("[sample-proof upload]", err);
    // #region agent log
    fetch("http://127.0.0.1:7328/ingest/3b6d6cf8-0b13-4001-8f24-c47cea3cb28e", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "9f4942" },
      body: JSON.stringify({
        sessionId: "9f4942",
        runId: "post-fix",
        hypothesisId: "H_db_schema_drift",
        location: "apps/web/src/app/api/orders/[id]/sample-proof/route.ts:catch",
        message: "sample proof upload failed",
        data: {
          prismaCode:
            err instanceof Prisma.PrismaClientKnownRequestError ? err.code : undefined,
          errMsg: err instanceof Error ? err.message : String(err),
          db: safeDbHint(),
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
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

