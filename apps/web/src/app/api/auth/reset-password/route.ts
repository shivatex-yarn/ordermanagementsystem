import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import {
  sendPasswordChangedNotification,
  sendPasswordChangedAdminAlert,
} from "@/lib/email";

/**
 * GET /api/auth/reset-password?token=<token>
 * Validates whether the token is still usable (not expired, exists in DB).
 * Used by the frontend to decide whether to show the form or an "expired" message.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token")?.trim() ?? "";
  if (!token || token.length !== 64) {
    return NextResponse.json({ valid: false, reason: "invalid_token" });
  }
  const user = await prisma.user.findFirst({
    where: {
      passwordResetToken: token,
      passwordResetExpiresAt: { gt: new Date() },
      active: true,
    },
    select: { id: true },
  });
  return NextResponse.json({ valid: Boolean(user) });
}

/**
 * POST /api/auth/reset-password
 * Body: { token: string; password: string; confirmPassword: string }
 * Resets the password if the token is valid, then:
 *  - Clears the reset token from the DB
 *  - Emails the user a confirmation
 *  - Emails all Super Admins an audit alert
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const token = typeof b.token === "string" ? b.token.trim() : "";
  const password = typeof b.password === "string" ? b.password : "";
  const confirmPassword = typeof b.confirmPassword === "string" ? b.confirmPassword : "";

  // --- Validate inputs -------------------------------------------------
  if (!token || token.length !== 64) {
    return NextResponse.json({ error: "Invalid or missing reset token." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }
  if (password !== confirmPassword) {
    return NextResponse.json({ error: "Passwords do not match." }, { status: 400 });
  }

  // --- Look up the token -----------------------------------------------
  const user = await prisma.user.findFirst({
    where: {
      passwordResetToken: token,
      passwordResetExpiresAt: { gt: new Date() },
      active: true,
    },
    select: {
      id: true,
      name: true,
      email: true,
      divisionId: true,
      division: { select: { name: true } },
    },
  });

  if (!user) {
    return NextResponse.json(
      { error: "This reset link has expired or is invalid. Please request a new one." },
      { status: 400 }
    );
  }

  // --- Update password & clear token -----------------------------------
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      passwordResetToken: null,
      passwordResetExpiresAt: null,
    },
  });

  const changedAt = new Date();
  const divisionName = user.division?.name ?? null;

  // Fire emails in background — don't let email failures block the response.
  Promise.all([
    // 1. Confirmation to the user
    sendPasswordChangedNotification(user.email, user.name, divisionName, changedAt),
    // 2. Admin alert to all Super Admins
    prisma.user
      .findMany({
        where: { role: "SUPER_ADMIN", active: true },
        select: { email: true },
      })
      .then((admins) =>
        sendPasswordChangedAdminAlert(
          admins.map((a) => a.email),
          user.name,
          user.email,
          divisionName,
          changedAt
        )
      ),
  ]).catch((err) => console.error("[reset-password] Post-reset email error:", err));

  return NextResponse.json({ ok: true, message: "Password updated successfully." });
}
