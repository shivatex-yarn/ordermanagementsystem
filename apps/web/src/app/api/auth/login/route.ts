import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { signToken, setSessionCookie } from "@/lib/auth";
import { loginSchema } from "@/lib/validation";
import { getRateLimitIdentifier, rateLimit } from "@/lib/rate-limit";

export async function POST(req: Request) {
  const { ok, remaining } = rateLimit(getRateLimitIdentifier(req));
  if (!ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "X-RateLimit-Remaining": "0" } }
    );
  }
  const body = await req.json();
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    include: { division: true },
  });
  if (!user) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }
  const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }
  const token = await signToken({
    sub: String(user.id),
    email: user.email,
    role: user.role,
    divisionId: user.divisionId ?? undefined,
  });
  await setSessionCookie(token);
  return NextResponse.json(
    {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        divisionId: user.divisionId,
      },
    },
    { headers: { "X-RateLimit-Remaining": String(remaining) } }
  );
}
