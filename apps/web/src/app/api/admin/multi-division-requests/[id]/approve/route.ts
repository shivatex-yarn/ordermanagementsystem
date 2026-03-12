import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withRole } from "@/lib/with-auth";

/** Super Admin only: approve multi-division access request */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await withRole(["SUPER_ADMIN"]);
  if (auth.response) return auth.response;
  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid request id" }, { status: 400 });
  }
  const request = await prisma.multiDivisionAccessRequest.findUnique({
    where: { id },
    include: { divisions: { select: { divisionId: true } } },
  });
  if (!request) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }
  if (request.status !== "PENDING") {
    return NextResponse.json(
      { error: "Request is already processed" },
      { status: 400 }
    );
  }
  const approvedById = Number(auth.payload.sub);
  const approvedAt = new Date();
  await prisma.$transaction([
    prisma.multiDivisionAccessRequest.update({
      where: { id },
      data: { status: "APPROVED", approvedById, approvedAt },
    }),
    ...request.divisions.map((d) =>
      prisma.divisionManager.upsert({
        where: {
          divisionId_userId: {
            divisionId: d.divisionId,
            userId: request.userId,
          },
        },
        create: { divisionId: d.divisionId, userId: request.userId },
        update: {},
      })
    ),
  ]);
  const updated = await prisma.multiDivisionAccessRequest.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true } },
      approvedBy: { select: { id: true, name: true, email: true } },
      divisions: { include: { division: { select: { id: true, name: true } } } },
    },
  });
  return NextResponse.json(updated);
}
