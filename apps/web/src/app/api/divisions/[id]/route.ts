import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logAudit, notify, salesInDivision, superAdminIds } from "@/lib/activity";
import { withRole } from "@/lib/with-auth";
import { divisionUpdateSchema } from "@/lib/validation";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await withRole(["SUPER_ADMIN"]);
  if (auth.response) return auth.response;
  const id = Number((await ctx.params).id);
  const parsed = divisionUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  try {
    const updated = await prisma.division.update({ where: { id }, data: parsed.data });
    await logAudit({ actor: auth.payload, action: parsed.data.active === false ? "DIVISION_DEACTIVATED" : parsed.data.active === true ? "DIVISION_ACTIVATED" : "DIVISION_RENAMED", category: "DIVISION", entityType: "Division", entityId: id, entityLabel: updated.name, req });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Couldn't update that division" }, { status: 409 });
  }
}

/** Delete a division. Blocked while it still has enquiries (deactivate it instead). People mapped to it lose that access. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await withRole(["SUPER_ADMIN"]);
  if (auth.response) return auth.response;
  const id = Number((await ctx.params).id);
  const division = await prisma.division.findUnique({
    where: { id },
    select: { name: true, _count: { select: { orders: true } } },
  });
  if (!division) return NextResponse.json({ error: "Division not found" }, { status: 404 });
  if (division._count.orders > 0) {
    return NextResponse.json(
      { error: `${division.name} has ${division._count.orders} enquiries. Deactivate it instead of deleting.` },
      { status: 409 }
    );
  }
  await prisma.division.delete({ where: { id } });
  await logAudit({ actor: auth.payload, action: "DIVISION_DELETED", category: "DIVISION", entityType: "Division", entityId: id, entityLabel: division.name, req: _req });
  return NextResponse.json({ ok: true });
}
