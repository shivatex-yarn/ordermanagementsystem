import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";

export async function GET() {
  const auth = await withAuth();
  if (auth.response) return auth.response;
  const divisions = await prisma.division.findMany({
    orderBy: { name: "asc" },
    include: {
      managers: { include: { user: { select: { id: true, name: true, email: true } } } },
    },
  });
  return NextResponse.json({ divisions });
}
