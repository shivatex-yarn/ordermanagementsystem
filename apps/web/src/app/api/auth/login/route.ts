import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { signToken } from "@/lib/auth";
import { loginSchema } from "@/lib/validation";
import { getRateLimitIdentifier, rateLimit } from "@/lib/rate-limit";

const COOKIE_NAME = "oms_token";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

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
  if (!user.active) {
    return NextResponse.json({ error: "Account is inactive. Contact admin." }, { status: 403 });
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
  const response = NextResponse.json(
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
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });
  return response;
}
