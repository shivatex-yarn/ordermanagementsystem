import { NextResponse } from "next/server";
import path from "path";
import { withAuth } from "@/lib/with-auth";
import { canCreateEnquiry } from "@/lib/roles";

export const runtime = "nodejs";

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

export async function POST(req: Request) {
  const auth = await withAuth();
  if (auth.response) return auth.response;
  if (!canCreateEnquiry(auth.payload.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size <= 0) return NextResponse.json({ error: "Choose a file" }, { status: 400 });
  if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "File too large (max 5 MB)" }, { status: 400 });
  const ext = path.extname(file.name).toLowerCase();
  if (!MIME[ext]) return NextResponse.json({ error: "Use a PDF, JPG or PNG file" }, { status: 400 });
  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  return NextResponse.json({ url: `data:${MIME[ext]};base64,${base64}`, name: file.name });
}
