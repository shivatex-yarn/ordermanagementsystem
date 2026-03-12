import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";

export async function GET() {
  try {
    const auth = await withAuth();
    if (auth.response) return auth.response;
    const userId = Number(auth.payload.sub);
    if (!Number.isInteger(userId) || userId < 1) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        divisionId: true,
        division: { select: { id: true, name: true } },
      },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    return NextResponse.json({ user });
  } catch (err) {
    console.error("[api/auth/me]", err);
    return NextResponse.json(
      { error: "Failed to load session" },
      { status: 500 }
    );
  }
}
