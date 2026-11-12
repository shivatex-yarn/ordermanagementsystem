import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { logAudit } from "@/lib/activity";

/** Name, phone and employee code are what a person can change about themselves. Email is fixed (admin-managed). */
const schema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(255),
  phone: z.string().trim().max(30).optional().default(""),
  /** Omit to leave unchanged; empty string clears it. */
  employeeCode: z.string().trim().max(40, "Employee code is too long (40 characters max)").optional(),
});

export async function PATCH(req: Request) {
  const auth = await withAuth();
  if (auth.response) return auth.response;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const id = Number(auth.payload.sub);
  const code = parsed.data.employeeCode;
  if (code) {
    const clash = await prisma.user.findUnique({ where: { employeeCode: code }, select: { id: true } });
    if (clash && clash.id !== id) {
      return NextResponse.json({ error: `Employee code ${code} is already used by someone else` }, { status: 409 });
    }
  }
  const user = await prisma.user.update({
    where: { id },
    data: { name: parsed.data.name, phone: parsed.data.phone || null, ...(code === undefined ? {} : { employeeCode: code || null }) },
    select: { id: true, name: true, email: true, employeeCode: true, phone: true, role: true },
  });
  await logAudit({ actor: auth.payload, action: "PROFILE_UPDATED", category: "AUTH", entityType: "User", entityId: id, entityLabel: user.name, req });
  return NextResponse.json({ user });
}
