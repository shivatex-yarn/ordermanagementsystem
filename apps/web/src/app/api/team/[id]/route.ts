import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { withRole } from "@/lib/with-auth";
import { adminUpdateUserSchema } from "@/lib/validation";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await withRole(["SUPER_ADMIN"]);
  if (auth.response) return auth.response;
  const id = Number((await ctx.params).id);
  const parsed = adminUpdateUserSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const target = await prisma.user.findUnique({ where: { id }, select: { role: true } });
  if (!target) return NextResponse.json({ error: "Person not found" }, { status: 404 });
  if (target.role === "SUPER_ADMIN") {
    return NextResponse.json({ error: "Super admin accounts can't be edited here" }, { status: 403 });
  }
  const { password, divisionIds, email, ...rest } = parsed.data;
  const user = await prisma.$transaction(async (tx) => {
    if (divisionIds) {
      await tx.userDivision.deleteMany({ where: { userId: id } });
      await tx.userDivision.createMany({ data: divisionIds.map((divisionId) => ({ userId: id, divisionId })) });
    }
    return tx.user.update({
      where: { id },
      data: {
        ...rest,
        ...(email ? { email: email.trim().toLowerCase() } : {}),
        ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}),
      },
      select: { id: true, name: true, email: true, phone: true, role: true, active: true },
    });
  });
  return NextResponse.json(user);
}

/** Delete a person. Blocked for Super admins, yourself, and anyone who already worked on enquiries (deactivate instead). */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await withRole(["SUPER_ADMIN"]);
  if (auth.response) return auth.response;
  const id = Number((await ctx.params).id);
  if (id === Number(auth.payload.sub)) {
    return NextResponse.json({ error: "You can't delete your own account" }, { status: 400 });
  }
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      name: true,
      role: true,
      _count: { select: { createdOrders: true, assignedOrders: true, pricedOrders: true } },
    },
  });
  if (!user) return NextResponse.json({ error: "Person not found" }, { status: 404 });
  if (user.role === "SUPER_ADMIN") {
    return NextResponse.json({ error: "Super admin accounts can't be deleted here" }, { status: 403 });
  }
  const used = user._count.createdOrders + user._count.assignedOrders + user._count.pricedOrders;
  if (used > 0) {
    return NextResponse.json(
      { error: `${user.name} has worked on ${used} enquiries. Deactivate them instead of deleting.` },
      { status: 409 }
    );
  }
  await prisma.user.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
