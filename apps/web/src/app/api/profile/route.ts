import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { logAudit } from "@/lib/activity";

/** Name and phone are the only things a person can change about themselves. Email is fixed (admin-managed). */
const schema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(255),
  phone: z.string().trim().max(30).optional().default(""),
});

export async function PATCH(req: Request) {
  const auth = await withAuth();
  if (auth.response) return auth.response;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const id = Number(auth.payload.sub);
  const user = await prisma.user.update({
    where: { id },
    data: { name: parsed.data.name, phone: parsed.data.phone || null },
    select: { id: true, name: true, email: true, phone: true, role: true },
  });
  await logAudit({ actor: auth.payload, action: "PROFILE_UPDATED", category: "AUTH", entityType: "User", entityId: id, entityLabel: user.name, req });
  return NextResponse.json({ user });
}
