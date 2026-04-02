import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { timingHeaderValue, withTiming } from "@/lib/server-timing";

const MOCK_EMAIL = "superadmin@shivatex.in";
const OFFLINE_MOCK_SUB = "0";

export async function GET() {
  const marks: { name: string; durMs: number; desc?: string }[] = [];
  try {
    const auth = await withAuth();
    if (auth.response) return auth.response;

    if (auth.payload.sub === OFFLINE_MOCK_SUB && auth.payload.email === MOCK_EMAIL) {
      return NextResponse.json({
        user: {
          id: 0,
          name: "Super Admin (offline)",
          email: auth.payload.email,
          role: auth.payload.role,
          divisionId: auth.payload.divisionId ?? null,
          division: null,
        },
      });
    }

    const userId = Number(auth.payload.sub);
    if (!Number.isInteger(userId) || userId < 1) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const db = await withTiming("db_user", () =>
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          divisionId: true,
          division: { select: { id: true, name: true } },
        },
      })
    );
    marks.push(db.mark);
    const user = db.value;
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const payload = { user };
    const res = NextResponse.json(payload);
    res.headers.set("Server-Timing", timingHeaderValue(marks));
    return res;
  } catch (err) {
    console.error("[api/auth/me]", err);
    return NextResponse.json(
      { error: "Failed to load session" },
      { status: 500 }
    );
  }
}
