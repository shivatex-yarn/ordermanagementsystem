import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withRole } from "@/lib/with-auth";

/** Super Admin only: list multi-division access requests */
export async function GET(req: Request) {
  const auth = await withRole(["SUPER_ADMIN", "MANAGING_DIRECTOR"]);
  if (auth.response) return auth.response;
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || undefined;
  const requests = await prisma.multiDivisionAccessRequest.findMany({
    where: status ? { status: status as "PENDING" | "APPROVED" | "REJECTED" } : undefined,
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { id: true, name: true, email: true } },
      approvedBy: { select: { id: true, name: true, email: true } },
      divisions: { include: { division: { select: { id: true, name: true } } } },
    },
  });
  return NextResponse.json({ requests });
}
