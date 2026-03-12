import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withRole } from "@/lib/with-auth";
import { z } from "zod";

const bodySchema = z.object({ userId: z.number().int().positive() });

/** Super Admin only: assign a user as Division Head to this division */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await withRole(["SUPER_ADMIN"]);
  if (auth.response) return auth.response;
  const divisionId = Number((await params).id);
  if (!Number.isInteger(divisionId)) {
    return NextResponse.json({ error: "Invalid division id" }, { status: 400 });
  }
  const body = await req.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const division = await prisma.division.findUnique({
    where: { id: divisionId },
  });
  if (!division) {
    return NextResponse.json({ error: "Division not found" }, { status: 404 });
  }
  const user = await prisma.user.findUnique({
    where: { id: parsed.data.userId },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  const existing = await prisma.divisionManager.findUnique({
    where: {
      divisionId_userId: { divisionId, userId: parsed.data.userId },
    },
  });
  if (existing) {
    return NextResponse.json(
      { error: "User is already a Division Head for this division" },
      { status: 409 }
    );
  }
  const manager = await prisma.divisionManager.create({
    data: { divisionId, userId: parsed.data.userId },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  return NextResponse.json(manager, { status: 201 });
}

/** Super Admin only: remove Division Head from this division */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await withRole(["SUPER_ADMIN"]);
  if (auth.response) return auth.response;
  const divisionId = Number((await params).id);
  if (!Number.isInteger(divisionId)) {
    return NextResponse.json({ error: "Invalid division id" }, { status: 400 });
  }
  const { searchParams } = new URL(req.url);
  const userIdParam = searchParams.get("userId");
  const userId = userIdParam ? Number(userIdParam) : NaN;
  if (!Number.isInteger(userId)) {
    return NextResponse.json({ error: "userId query required" }, { status: 400 });
  }
  await prisma.divisionManager.deleteMany({
    where: { divisionId, userId },
  });
  return NextResponse.json({ ok: true });
}
