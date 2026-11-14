import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/activity";
import { withRole } from "@/lib/with-auth";
import { organizationUpdateSchema } from "@/lib/validation";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await withRole(["SUPER_ADMIN"]);
  if (auth.response) return auth.response;
  const id = Number((await ctx.params).id);
  const parsed = organizationUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  try {
    const updated = await prisma.organization.update({ where: { id }, data: parsed.data });
    await logAudit({ actor: auth.payload, action: parsed.data.active === false ? "ORGANIZATION_DEACTIVATED" : parsed.data.active === true ? "ORGANIZATION_ACTIVATED" : "ORGANIZATION_RENAMED", category: "ORGANIZATION", entityType: "Organization", entityId: id, entityLabel: updated.name, req });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Couldn't update that organization (name may already exist)" }, { status: 409 });
  }
}

/** Delete an organization. People in it are kept and simply left without an organization. */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await withRole(["SUPER_ADMIN"]);
  if (auth.response) return auth.response;
  const id = Number((await ctx.params).id);
  const org = await prisma.organization.findUnique({ where: { id }, select: { name: true } });
  if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  await prisma.organization.delete({ where: { id } });
  await logAudit({ actor: auth.payload, action: "ORGANIZATION_DELETED", category: "ORGANIZATION", entityType: "Organization", entityId: id, entityLabel: org.name, req });
  return NextResponse.json({ ok: true });
}
