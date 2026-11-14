import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { logAudit, notify, salesInDivision, superAdminIds } from "@/lib/activity";
import { withRole } from "@/lib/with-auth";
import { adminCreateUserSchema } from "@/lib/validation";
import { sendEmail } from "@/lib/email";
import { roleLabel } from "@/lib/roles";
import { COMPANY_NAME } from "@/lib/branding";

const select = {
  id: true,
  name: true,
  email: true,
  employeeCode: true,
  phone: true,
  organization: { select: { id: true, name: true } },
  role: true,
  active: true,
  createdAt: true,
  divisions: { select: { division: { select: { id: true, name: true } } } },
} as const;

function shape<T extends { divisions: { division: { id: number; name: string } }[] }>(u: T) {
  return { ...u, divisions: u.divisions.map((d) => d.division) };
}

/** Super admin: list the team. */
export async function GET() {
  const auth = await withRole(["SUPER_ADMIN"]);
  if (auth.response) return auth.response;
  const users = await prisma.user.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }], select });
  return NextResponse.json({ users: users.map(shape) });
}

/** Super admin: add a Marketing or Sales person and map them to divisions. */
export async function POST(req: Request) {
  const auth = await withRole(["SUPER_ADMIN"]);
  if (auth.response) return auth.response;
  const parsed = adminCreateUserSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const d = parsed.data;
  const email = d.email.trim().toLowerCase();
  if (await prisma.user.findUnique({ where: { email } })) {
    return NextResponse.json({ error: "That email is already registered" }, { status: 409 });
  }
  if (d.employeeCode && (await prisma.user.findUnique({ where: { employeeCode: d.employeeCode } }))) {
    return NextResponse.json({ error: `Employee code ${d.employeeCode} is already used by someone else` }, { status: 409 });
  }
  if (d.organizationId && !(await prisma.organization.findUnique({ where: { id: d.organizationId }, select: { id: true } }))) {
    return NextResponse.json({ error: "That organization no longer exists" }, { status: 400 });
  }
  const user = await prisma.user.create({
    data: {
      name: d.name.trim(),
      employeeCode: d.employeeCode ?? null,
      email,
      phone: d.phone ?? null,
      role: d.role,
      organizationId: d.organizationId ?? null,
      passwordHash: await bcrypt.hash(d.password, 10),
      divisions: { create: (d.role === "MARKETING" || d.role === "SALES" ? d.divisionIds : []).map((divisionId) => ({ divisionId })) },
    },
    select,
  });
  void sendEmail({
    to: email,
    subject: `Your ${COMPANY_NAME} login`,
    html: `<p>Hi ${d.name},</p><p>${COMPANY_NAME} has added you to the enquiry system as <b>${roleLabel(d.role)}</b>. Sign in with this email and the password your admin shared with you.</p>`,
    text: `Hi ${d.name}, you have been added to the ${COMPANY_NAME} enquiry system. Sign in with this email and the password your admin shared.`,
  }).catch(() => undefined);
  await logAudit({ actor: auth.payload, action: "TEAM_MEMBER_ADDED", category: "TEAM", entityType: "User", entityId: user.id, entityLabel: user.name, detail: `${d.role}${d.divisionIds.length ? " · " + d.divisionIds.length + " divisions" : ""}`, req });
  return NextResponse.json(shape(user), { status: 201 });
}
