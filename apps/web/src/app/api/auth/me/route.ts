import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";

export async function GET() {
  const auth = await withAuth();
  if (auth.response) return auth.response;
  const user = await prisma.user.findUnique({
    where: { id: Number(auth.payload.sub) },
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
}
