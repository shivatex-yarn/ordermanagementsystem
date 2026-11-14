import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/activity";
import { withRole } from "@/lib/with-auth";
import { organizationCreateSchema } from "@/lib/validation";

/** List organizations: Super admin (Organizations page, team form) and MD / Accounts (organization filter). */
export async function GET() {
  const auth = await withRole(["SUPER_ADMIN", "MANAGING_DIRECTOR", "ACCOUNTS"]);
  if (auth.response) return auth.response;
  const organizations = await prisma.organization.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: { id: true, name: true, active: true, _count: { select: { users: true } } },
  });
  return NextResponse.json({ organizations });
}

export async function POST(req: Request) {
  const auth = await withRole(["SUPER_ADMIN"]);
  if (auth.response) return auth.response;
  const parsed = organizationCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter an organization name" }, { status: 400 });
  try {
    const org = await prisma.organization.create({ data: { name: parsed.data.name } });
    await logAudit({ actor: auth.payload, action: "ORGANIZATION_CREATED", category: "ORGANIZATION", entityType: "Organization", entityId: org.id, entityLabel: org.name, req });
    return NextResponse.json(org, { status: 201 });
  } catch {
    return NextResponse.json({ error: "An organization with that name already exists" }, { status: 409 });
  }
}
