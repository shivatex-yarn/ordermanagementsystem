import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { sendPasswordResetEmail } from "@/lib/email";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/** POST /api/auth/forgot-password  —  body: { email: string } */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const email =
    typeof (body as Record<string, unknown>)?.email === "string"
      ? ((body as Record<string, unknown>).email as string).trim().toLowerCase()
      : "";

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "A valid email address is required." }, { status: 400 });
  }

  // Always return the same response so attackers can't enumerate users.
  const SAFE_RESPONSE = NextResponse.json({
    ok: true,
    message: "If that email is registered, a reset link has been sent.",
  });

  let user: { id: number; name: string; email: string; active: boolean } | null = null;
  try {
    user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true, active: true },
    });
  } catch (err) {
    console.error("[forgot-password] DB error", err);
    // Don't reveal the error — return the safe response.
    return SAFE_RESPONSE;
  }

  if (!user || !user.active) return SAFE_RESPONSE;

  // Generate a secure 64-char hex token, store it with a 1-hour expiry.
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

  try {
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordResetToken: token, passwordResetExpiresAt: expiresAt },
    });
  } catch (err) {
    console.error("[forgot-password] Could not store reset token", err);
    return SAFE_RESPONSE;
  }

  const resetUrl = `${APP_URL}/reset-password?token=${token}`;
  const emailResult = await sendPasswordResetEmail(user.email, user.name, resetUrl);
  if (!emailResult.ok) {
    console.error("[forgot-password] Email send failed:", emailResult.error);
  }

  return SAFE_RESPONSE;
}
