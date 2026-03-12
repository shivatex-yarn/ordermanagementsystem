import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withRole } from "@/lib/with-auth";

/** Super Admin only: list users for assigning Division Heads */
export async function GET() {
  const auth = await withRole(["SUPER_ADMIN"]);
  if (auth.response) return auth.response;
  const users = await prisma.user.findMany({
    orderBy: [{ name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      divisionId: true,
      division: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json({ users });
}
