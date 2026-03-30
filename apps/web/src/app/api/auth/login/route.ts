import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { signToken } from "@/lib/auth";
import { loginSchema } from "@/lib/validation";
import { getRateLimitIdentifier, rateLimit } from "@/lib/rate-limit";
import { Role } from "@prisma/client";

const LOGIN_MAX_PER_MINUTE = 30;

const COOKIE_NAME = "oms_token";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

/** Known test credentials — prefer real DB user (seed) so data saves; offline token only if DB is unreachable. */
const MOCK_EMAIL = "superadmin@shivatex.in";
const MOCK_PASSWORD = "shivatex@12345";

/** JWT sub used only when database is unreachable (no writes to DB possible). */
const OFFLINE_MOCK_SUB = "0";

export async function POST(req: Request) {
  const { ok, remaining } = await rateLimit(getRateLimitIdentifier(req), LOGIN_MAX_PER_MINUTE);
  if (!ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "X-RateLimit-Remaining": String(remaining) } }
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

  const emailNorm = parsed.data.email.trim().toLowerCase();
  const password = parsed.data.password;
  const isMockCreds = emailNorm === MOCK_EMAIL && password === MOCK_PASSWORD;

  let user;
  try {
    user = await prisma.user.findUnique({
      where: { email: emailNorm },
      include: { division: true },
    });
  } catch {
    if (isMockCreds) {
      const token = await signToken({
        sub: OFFLINE_MOCK_SUB,
        email: MOCK_EMAIL,
        role: "SUPER_ADMIN" as Role,
      });
      const response = NextResponse.json(
        {
          user: {
            id: 0,
            name: "Super Admin (offline)",
            email: MOCK_EMAIL,
            role: "SUPER_ADMIN" as Role,
            divisionId: null,
            offline: true,
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
    return NextResponse.json(
      { error: "Database unavailable. Please try again." },
      { status: 500 }
    );
  }

  if (!user) {
    if (isMockCreds) {
      return NextResponse.json(
        {
          error:
            "Mock user not found in database. From apps/web run: npm run db:seed",
        },
        { status: 401 }
      );
    }
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }
  if (!user.active) {
    return NextResponse.json({ error: "Account is inactive. Contact admin." }, { status: 403 });
  }
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const sessionId = randomUUID();
  const forwarded = req.headers.get("x-forwarded-for");
  const ip =
    forwarded?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    null;
  const userAgent = req.headers.get("user-agent") ?? null;

  try {
    await prisma.userLoginSession.create({
      data: {
        userId: user.id,
        sessionId,
        ipAddress: ip,
        userAgent,
      },
    });
  } catch (err) {
    console.error("[login] UserLoginSession create failed:", err);
  }

  const token = await signToken({
    sub: String(user.id),
    email: user.email,
    role: user.role,
    divisionId: user.divisionId ?? undefined,
    sid: sessionId,
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
