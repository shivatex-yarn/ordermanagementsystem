import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withRole } from "@/lib/with-auth";
import { divisionUpdateSchema } from "@/lib/validation";

/** Super Admin only: update division (name, active) */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await withRole(["SUPER_ADMIN"]);
  if (auth.response) return auth.response;
  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid division id" }, { status: 400 });
  }
  const body = await req.json();
  const parsed = divisionUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const division = await prisma.division.findUnique({ where: { id } });
  if (!division) {
    return NextResponse.json({ error: "Division not found" }, { status: 404 });
  }
  if (parsed.data.name !== undefined && parsed.data.name !== division.name) {
    const existing = await prisma.division.findUnique({
      where: { name: parsed.data.name },
    });
    if (existing) {
      return NextResponse.json({ error: "Division name already exists" }, { status: 409 });
    }
  }
  const updated = await prisma.division.update({
    where: { id },
    data: {
      ...(parsed.data.name !== undefined && { name: parsed.data.name }),
      ...(parsed.data.active !== undefined && { active: parsed.data.active }),
    },
    include: {
      managers: { include: { user: { select: { id: true, name: true, email: true } } } },
    },
  });
  return NextResponse.json(updated);
}

/** Super Admin only: permanently delete division from database. Fails if division is in use (enquiries, transfers, etc.). */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await withRole(["SUPER_ADMIN"]);
  if (auth.response) return auth.response;
  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid division id" }, { status: 400 });
  }
  const division = await prisma.division.findUnique({ where: { id } });
  if (!division) {
    return NextResponse.json({ error: "Division not found" }, { status: 404 });
  }

  const [ordersCount, transfersCount, rejectionsCount, breachesCount] = await Promise.all([
    prisma.order.count({ where: { OR: [{ currentDivisionId: id }, { previousDivisionId: id }] } }),
    prisma.orderTransfer.count({ where: { OR: [{ fromDivisionId: id }, { toDivisionId: id }] } }),
    prisma.orderRejection.count({ where: { divisionId: id } }),
    prisma.sLABreach.count({ where: { divisionId: id } }),
  ]);
  if (ordersCount > 0 || transfersCount > 0 || rejectionsCount > 0 || breachesCount > 0) {
    return NextResponse.json(
      {
        error:
          "Cannot delete division: it is in use by enquiries, transfers, or other records. Set status to Inactive in Edit instead.",
      },
      { status: 409 }
    );
  }

  await prisma.$transaction([
    prisma.user.updateMany({ where: { divisionId: id }, data: { divisionId: null } }),
    prisma.division.delete({ where: { id } }),
  ]);
  return NextResponse.json({ ok: true });
}
