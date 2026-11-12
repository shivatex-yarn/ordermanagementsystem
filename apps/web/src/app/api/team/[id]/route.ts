import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { logAudit, notify, salesInDivision, superAdminIds } from "@/lib/activity";
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
  if (rest.employeeCode) {
    const clash = await prisma.user.findUnique({ where: { employeeCode: rest.employeeCode }, select: { id: true } });
    if (clash && clash.id !== id) {
      return NextResponse.json({ error: `Employee code ${rest.employeeCode} is already used by someone else` }, { status: 409 });
    }
  }
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
      select: { id: true, name: true, email: true, employeeCode: true, phone: true, role: true, active: true },
    });
  });
  const what = parsed.data.active === false ? "TEAM_MEMBER_DEACTIVATED" : parsed.data.active === true ? "TEAM_MEMBER_ACTIVATED" : "TEAM_MEMBER_EDITED";
  await logAudit({ actor: auth.payload, action: what, category: "TEAM", entityType: "User", entityId: id, entityLabel: user.name, detail: divisionIds ? `Divisions set (${divisionIds.length})` : parsed.data.role ? `Role ${parsed.data.role}` : null, req });
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
  await logAudit({ actor: auth.payload, action: "TEAM_MEMBER_DELETED", category: "TEAM", entityType: "User", entityId: id, entityLabel: user.name, detail: user.role, req: _req });
  return NextResponse.json({ ok: true });
}
