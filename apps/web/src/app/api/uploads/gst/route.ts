import { NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { userMayCreateEnquiry } from "@/lib/enquiry-access";
import path from "path";

export const runtime = "nodejs";

const MIME_MAP: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

export async function POST(req: Request) {
  try {
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
    if (!MIME_MAP[ext]) {
      return NextResponse.json(
        { error: "Unsupported file type. Allowed: PDF, JPG, PNG" },
        { status: 400 }
      );
    }

    const buf = await file.arrayBuffer();
    const base64 = Buffer.from(buf).toString("base64");
    const dataUrl = `data:${MIME_MAP[ext]};base64,${base64}`;

    // Stored as JSON in the DB: { url: "<data URI>", name: "<original filename>" }
    return NextResponse.json({ url: dataUrl, name: file.name });
  } catch (err) {
    console.error("[GST upload]", err);
    return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 });
  }
}
