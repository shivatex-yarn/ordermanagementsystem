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

/** Known test credentials — prefer real DB user (seed) so data saves; offline token if DB is unreachable, or in development if the seed user is missing. */
const MOCK_EMAIL = "superadmin@shivatex.in";
const MOCK_PASSWORD = "shivatex@12345";

/** JWT sub used only when database is unreachable (no writes to DB possible). */
const OFFLINE_MOCK_SUB = "0";

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  };
}

async function respondOfflineMockLogin(remaining: number) {
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
  response.cookies.set(COOKIE_NAME, token, cookieOptions());
  return response;
}

export async function POST(req: Request) {
  const { ok, remaining } = await rateLimit(getRateLimitIdentifier(req), LOGIN_MAX_PER_MINUTE);
  if (!ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "X-RateLimit-Remaining": String(remaining) } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
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
    } catch (err) {
      console.error("[login] prisma user lookup failed:", err);
      if (isMockCreds) {
        return await respondOfflineMockLogin(remaining);
      }
      return NextResponse.json(
        { error: "Database unavailable. Check DATABASE_URL and run db:push / db:seed." },
        { status: 503 }
      );
    }

    if (!user) {
      if (isMockCreds && process.env.NODE_ENV === "development") {
        return await respondOfflineMockLogin(remaining);
      }
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

    let valid = false;
    try {
      valid = await bcrypt.compare(password, user.passwordHash);
    } catch (compareErr) {
      console.error("[login] bcrypt.compare failed:", compareErr);
    }
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
    response.cookies.set(COOKIE_NAME, token, cookieOptions());
    return response;
  } catch (err) {
    console.error("[login] unexpected error:", err);
    return NextResponse.json(
      { error: "Login failed. Please try again." },
      { status: 500, headers: { "X-RateLimit-Remaining": String(remaining) } }
    );
  }
}
