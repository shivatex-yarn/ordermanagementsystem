import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { registerSchema } from "@/lib/validation";
import { withRole } from "@/lib/with-auth";
import { getRateLimitIdentifier, rateLimit } from "@/lib/rate-limit";

export async function POST(req: Request) {
  const auth = await withRole(["SUPER_ADMIN"]);
  if (auth.response) return auth.response;
  const { ok } = await rateLimit(getRateLimitIdentifier(req), 60);
  if (!ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const body = await req.json();
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const existing = await prisma.user.findUnique({
    where: { email: parsed.data.email },
  });
  if (existing) {
    return NextResponse.json({ error: "Email already registered" }, { status: 409 });
  }
  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash,
      role: parsed.data.role ?? "USER",
      divisionId: parsed.data.divisionId,
    },
    select: { id: true, name: true, email: true, role: true, divisionId: true },
  });
  if (parsed.data.role === "MANAGER" && parsed.data.divisionId) {
    await prisma.divisionManager.upsert({
      where: {
        divisionId_userId: {
          divisionId: parsed.data.divisionId,
          userId: user.id,
        },
      },
      create: { divisionId: parsed.data.divisionId, userId: user.id },
      update: {},
    });
  }
  return NextResponse.json({ user });
}
