import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";

export async function GET(req: Request) {
  const auth = await withAuth();
  if (auth.response) return auth.response;
  const { searchParams } = new URL(req.url);
  const unreadOnly = searchParams.get("unreadOnly") === "true";
  const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit")) || 20));
  const notifications = await prisma.notification.findMany({
    where: { userId: Number(auth.payload!.sub), ...(unreadOnly ? { read: false } : {}) },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return NextResponse.json({ notifications });
}

export async function PATCH(req: Request) {
  const auth = await withAuth();
  if (auth.response) return auth.response;
  const body = await req.json();
  const id = body.id ?? body.ids;
  if (id == null) {
    return NextResponse.json({ error: "id or ids required" }, { status: 400 });
  }
  const ids = Array.isArray(id) ? id : [id];
  await prisma.notification.updateMany({
    where: { id: { in: ids }, userId: Number(auth.payload!.sub) },
    data: { read: true },
  });
  return NextResponse.json({ ok: true });
}
