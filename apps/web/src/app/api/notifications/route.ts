import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { enrichNotificationRecords } from "@/lib/notification-enrich";

/** JWT `sub` must be a non-negative integer (0 = offline mock user). */
function parseUserId(sub: string): number | null {
  const n = Number(sub);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

export async function GET(req: Request) {
  try {
    const auth = await withAuth();
    if (auth.response) return auth.response;
    const userId = parseUserId(auth.payload.sub);
    if (userId == null) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }
    const { searchParams } = new URL(req.url);

    if (searchParams.get("countOnly") === "true") {
      const unreadCount = await prisma.notification.count({ where: { userId, read: false } });
      return NextResponse.json({ unreadCount });
    }

    const unreadOnly = searchParams.get("unreadOnly") === "true";
    const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit")) || 20));
    const rows = await prisma.notification.findMany({
      where: { userId, ...(unreadOnly ? { read: false } : {}) },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    const notifications = await enrichNotificationRecords(rows);
    return NextResponse.json({ notifications });
  } catch (err) {
    console.error("[GET /api/notifications]", err);
    return NextResponse.json({ error: "Failed to load notifications" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await withAuth();
    if (auth.response) return auth.response;
    const userId = parseUserId(auth.payload.sub);
    if (userId == null) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }
    const body = await req.json();
    const id = body.id ?? body.ids;
    if (id == null) {
      return NextResponse.json({ error: "id or ids required" }, { status: 400 });
    }
    const ids = Array.isArray(id) ? id : [id];
    await prisma.notification.updateMany({
      where: { id: { in: ids }, userId },
      data: { read: true },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[PATCH /api/notifications]", err);
    return NextResponse.json({ error: "Failed to update notifications" }, { status: 500 });
  }
}
