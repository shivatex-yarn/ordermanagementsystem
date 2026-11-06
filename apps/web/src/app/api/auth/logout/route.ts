import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { clearSession, verifyToken } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/activity";

const COOKIE_NAME = "oms_token";

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const payload = token ? await verifyToken(token) : null;
  if (payload?.sid) {
    try {
      await prisma.userLoginSession.updateMany({
        where: { sessionId: payload.sid, loggedOutAt: null },
        data: { loggedOutAt: new Date() },
      });
    } catch (err) {
      console.error("[logout] session update failed:", err);
    }
  }
  if (payload) await logAudit({ actor: payload, action: "LOGOUT", category: "AUTH", req });
  await clearSession();
  return NextResponse.json({ ok: true });
}
