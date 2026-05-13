import { NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { userMayCreateEnquiry } from "@/lib/enquiry-access";
import path from "path";
import { promises as fs } from "fs";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const auth = await withAuth();
  if (auth.response) return auth.response;

  if (!userMayCreateEnquiry(auth.payload.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
  const allowed = new Set([".png", ".jpg", ".jpeg", ".webp", ".pdf"]);
  if (!allowed.has(ext)) {
    return NextResponse.json(
      { error: "Unsupported file type (allowed: png, jpg, webp, pdf)" },
      { status: 400 }
    );
  }

  const filename = `gst-${Date.now()}-${Math.random().toString(36).slice(2, 7)}${ext}`;
  const relUrl = `/uploads/gst/${filename}`;
  const uploadDir = path.join(process.cwd(), "public", "uploads", "gst");
  await fs.mkdir(uploadDir, { recursive: true });
  const buf = await file.arrayBuffer();
  await fs.writeFile(path.join(uploadDir, filename), Buffer.from(buf));

  return NextResponse.json({ url: relUrl });
}
