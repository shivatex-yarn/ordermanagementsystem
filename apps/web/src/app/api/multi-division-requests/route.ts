import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withRole } from "@/lib/with-auth";
import { z } from "zod";

const createSchema = z.object({
  reason: z.string().min(10).max(5000),
  divisionIds: z.array(z.number().int().positive()).min(1).max(20),
});

/** Division Head (MANAGER): view own multi-division access requests */
export async function GET() {
  const auth = await withRole(["MANAGER"]);
  if (auth.response) return auth.response;
  const userId = Number(auth.payload.sub);
  const requests = await prisma.multiDivisionAccessRequest.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      approvedBy: { select: { id: true, name: true, email: true } },
      divisions: { include: { division: { select: { id: true, name: true } } } },
    },
  });
  return NextResponse.json({ requests });
}

/** Division Head (MANAGER): submit multi-division access request */
export async function POST(req: Request) {
  const auth = await withRole(["MANAGER"]);
  if (auth.response) return auth.response;
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const userId = Number(auth.payload.sub);
  const divisions = await prisma.division.findMany({
    where: { id: { in: parsed.data.divisionIds } },
    select: { id: true },
  });
  const foundIds = divisions.map((d) => d.id);
  if (foundIds.length !== parsed.data.divisionIds.length) {
    return NextResponse.json(
      { error: "One or more division ids are invalid" },
      { status: 400 }
    );
  }
  const request = await prisma.multiDivisionAccessRequest.create({
    data: {
      userId,
      reason: parsed.data.reason,
      status: "PENDING",
      divisions: {
        create: parsed.data.divisionIds.map((divisionId) => ({ divisionId })),
      },
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
      divisions: { include: { division: { select: { id: true, name: true } } } },
    },
  });
  return NextResponse.json(request, { status: 201 });
}
