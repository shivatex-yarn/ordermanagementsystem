import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { withRole } from "@/lib/with-auth";
import { adminUpdateUserSchema } from "@/lib/validation";

/** Super Admin only: update user and division mapping */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await withRole(["SUPER_ADMIN"]);
  if (auth.response) return auth.response;
  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
  }
  const body = await req.json();
  const parsed = adminUpdateUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (parsed.data.email && parsed.data.email !== existing.email) {
    const duplicate = await prisma.user.findUnique({
      where: { email: parsed.data.email },
    });
    if (duplicate) {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    }
  }
  const isManager = (parsed.data.role ?? existing.role) === "MANAGER";
  const divisionIds = parsed.data.divisionIds;
  const updateData: {
    name?: string;
    email?: string;
    passwordHash?: string;
    role?: string;
    divisionId?: number | null;
    active?: boolean;
  } = {};
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.email !== undefined) updateData.email = parsed.data.email;
  if (parsed.data.password?.length) {
    updateData.passwordHash = await bcrypt.hash(parsed.data.password, 10);
  }
  if (parsed.data.role !== undefined) updateData.role = parsed.data.role;
  if (parsed.data.active !== undefined) updateData.active = parsed.data.active;
  if (parsed.data.divisionId !== undefined) {
    updateData.divisionId = parsed.data.divisionId ?? null;
  }
  if (isManager && divisionIds !== undefined) {
    updateData.divisionId = divisionIds[0] ?? null;
  } else if (!isManager && parsed.data.divisionId !== undefined) {
    updateData.divisionId = parsed.data.divisionId;
  }
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id },
      data: updateData as Prisma.UserUncheckedUpdateInput,
    });
    if (isManager && divisionIds !== undefined) {
      await tx.divisionManager.deleteMany({ where: { userId: id } });
      if (divisionIds.length > 0) {
        await tx.divisionManager.createMany({
          data: divisionIds.map((divisionId) => ({ divisionId, userId: id })),
          skipDuplicates: true,
        });
      }
    }
  });
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      divisionId: true,
      division: { select: { id: true, name: true } },
      managedDivisions: { include: { division: { select: { id: true, name: true } } } },
    },
  });
  return NextResponse.json(user);
}

/** Super Admin only: soft delete user (set active = false) */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await withRole(["SUPER_ADMIN"]);
  if (auth.response) return auth.response;
  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
  }
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  await prisma.user.update({
    where: { id },
    data: { active: false },
  });
  return NextResponse.json({ ok: true });
}
