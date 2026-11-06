import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";

/** The signed-in person's notifications. `?countOnly=1` returns just the unread count. */
export async function GET(req: Request) {
  const auth = await withAuth();
  if (auth.response) return auth.response;
  const userId = Number(auth.payload.sub);
  const sp = new URL(req.url).searchParams;
  const unreadCount = await prisma.notification.count({ where: { userId, read: false } });
  if (sp.get("countOnly")) return NextResponse.json({ unreadCount });
  const limit = Math.min(100, Number(sp.get("limit")) || 20);
  const notifications = await prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: limit });
  return NextResponse.json({ notifications, unreadCount });
}

/** Mark notifications read: `{ ids: [1,2] }` or `{ all: true }`. */
export async function PATCH(req: Request) {
  const auth = await withAuth();
  if (auth.response) return auth.response;
  const userId = Number(auth.payload.sub);
  const body = (await req.json().catch(() => ({}))) as { ids?: number[]; all?: boolean };
  await prisma.notification.updateMany({
    where: { userId, read: false, ...(body.all ? {} : { id: { in: body.ids ?? [] } }) },
    data: { read: true },
  });
  return NextResponse.json({ ok: true });
}
