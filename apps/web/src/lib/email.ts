import { Resend } from "resend";
import { APP_NAME, COMPANY_NAME } from "@/lib/branding";

const apiKey = process.env.RESEND_API_KEY;
const from = process.env.RESEND_FROM ?? `${COMPANY_NAME} <onboarding@resend.dev>`;

const resend = apiKey ? new Resend(apiKey) : null;

/** Safe for admin UI: booleans only, no secrets. */
export function getResendEmailStatus(): {
  apiKeyConfigured: boolean;
  fromCustom: boolean;
} {
  return {
    apiKeyConfigured: Boolean(apiKey?.trim()),
    fromCustom: Boolean(process.env.RESEND_FROM?.trim()),
  };
}

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

// Simple token-bucket throttle: max 4 sends/sec to stay safely under Resend's 5/sec limit.
const EMAIL_INTERVAL_MS = 250; // 4 per second
let lastSendAt = 0;

async function acquireSendSlot() {
  const now = Date.now();
  const wait = EMAIL_INTERVAL_MS - (now - lastSendAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastSendAt = Date.now();
}

/**
 * Send multiple emails sequentially, respecting Resend's 5/sec rate limit.
 * Pass an array of thunks; each is called in order with a 250 ms gap.
 */
export async function sendEmailsThrottled(
  sends: Array<() => Promise<{ ok: boolean; error?: string }>>
): Promise<void> {
  for (const fn of sends) {
    await acquireSendSlot();
    await fn().catch((err) => console.error("[email] throttled send error:", err));
  }
}

/**
 * Send an email via Resend. No-op if RESEND_API_KEY is not set.
 */
export async function sendEmail(options: SendEmailOptions): Promise<{ ok: boolean; error?: string }> {
  if (!resend) {
    const message = "Email not configured: RESEND_API_KEY is not set";
    console.warn("[email]", message, "| skipped:", options.subject, "→", options.to);
    return { ok: false, error: message };
  }
  const to = Array.isArray(options.to) ? options.to : [options.to];
  try {
    const { error } = await resend.emails.send({
      from,
      to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });
    if (error) {
      console.error("[email] Resend error:", error);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[email] Send failed:", message);
    return { ok: false, error: message };
  }
}

const FONT_STACK =
  'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function emailShell(innerBody: string, footerNote: string, maxWidthPx = 560): string {
  return `
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f4f4f7;margin:0;padding:40px 16px;font-family:${FONT_STACK};-webkit-font-smoothing:antialiased;">
  <tr>
    <td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:${maxWidthPx}px;background:#ffffff;border-radius:16px;border:1px solid #e4e4e7;box-shadow:0 10px 40px rgba(15,23,42,0.06);overflow:hidden;">
        ${innerBody}
      </table>
      <p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#a1a1aa;max-width:${maxWidthPx}px;">${escapeHtml(footerNote)}</p>
    </td>
  </tr>
</table>`;
}

/**
 * Send a notification email for an enquiry event (e.g. created, accepted, transferred).
 */

/**
 * Sends a password-reset confirmation link to the requesting user.
 * The `resetUrl` should be `APP_URL/reset-password?token=<plainToken>`.
 */
export async function sendPasswordResetEmail(
  toEmail: string,
  userName: string,
  resetUrl: string
): Promise<{ ok: boolean; error?: string }> {
  const subject = `Reset your password — ${COMPANY_NAME}`;
  const safeUser = escapeHtml(userName);
  const safeUrl = resetUrl.replace(/"/g, "&quot;");

  const html = emailShell(
    `
    <tr>
      <td style="background:linear-gradient(135deg,#1e293b 0%,#334155 100%);padding:32px 40px;">
        <p style="margin:0;font-size:13px;font-weight:600;letter-spacing:0.08em;color:#94a3b8;text-transform:uppercase;">${COMPANY_NAME}</p>
        <h1 style="margin:10px 0 0;font-size:24px;font-weight:700;color:#ffffff;line-height:1.3;">Password Reset Request</h1>
      </td>
    </tr>
    <tr>
      <td style="padding:36px 40px 32px;">
        <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">Hi <strong>${safeUser}</strong>,</p>
        <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">
          We received a request to reset the password for your account. Click the button below to set a new password.
          This link is valid for <strong>1 hour</strong>.
        </p>
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td align="center" style="padding:8px 0 28px;">
              <a href="${safeUrl}"
                 style="display:inline-block;background:#1e293b;color:#ffffff;font-size:15px;font-weight:600;
                        text-decoration:none;padding:14px 36px;border-radius:10px;letter-spacing:0.01em;">
                Reset Password
              </a>
            </td>
          </tr>
        </table>
        <p style="margin:0 0 12px;font-size:13px;color:#6b7280;line-height:1.6;">
          If the button doesn't work, copy and paste this link into your browser:
        </p>
        <p style="margin:0 0 24px;font-size:12px;color:#3b82f6;word-break:break-all;line-height:1.5;">${safeUrl}</p>
        <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6;">
          If you did not request a password reset, you can safely ignore this email. Your password will not change.
        </p>
      </td>
    </tr>`,
    `This is an automated security email from ${COMPANY_NAME}. Do not reply.`
  );

  const text = [
    `Hi ${userName},`,
    `We received a request to reset your password.`,
    `Click the link below to set a new password (valid for 1 hour):`,
    resetUrl,
    `If you did not request this, ignore this email — your password won't change.`,
  ].join("\n\n");

  return sendEmail({ to: toEmail, subject, html, text });
}

/**
 * Notifies the affected user and all Super Admins that a password was changed.
 */
export async function sendPasswordChangedNotification(
  toEmail: string,
  userName: string,
  divisionName: string | null,
  changedAt: Date
): Promise<{ ok: boolean; error?: string }> {
  const subject = `Your password has been changed — ${COMPANY_NAME}`;
  const safeUser = escapeHtml(userName);
  const safeDivision = escapeHtml(divisionName ?? "—");
  const dateStr = changedAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

  const html = emailShell(
    `
    <tr>
      <td style="background:linear-gradient(135deg,#1e293b 0%,#334155 100%);padding:32px 40px;">
        <p style="margin:0;font-size:13px;font-weight:600;letter-spacing:0.08em;color:#94a3b8;text-transform:uppercase;">${COMPANY_NAME}</p>
        <h1 style="margin:10px 0 0;font-size:24px;font-weight:700;color:#ffffff;line-height:1.3;">Password Changed</h1>
      </td>
    </tr>
    <tr>
      <td style="padding:36px 40px 32px;">
        <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6;">Hi <strong>${safeUser}</strong>,</p>
        <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">
          Your account password was successfully changed on <strong>${escapeHtml(dateStr)} IST</strong>.
        </p>
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:24px;">
          <tr><td style="padding:20px 24px;">
            <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;">Account details</p>
            <p style="margin:0 0 4px;font-size:14px;color:#1e293b;"><strong>Name:</strong> ${safeUser}</p>
            <p style="margin:0 0 4px;font-size:14px;color:#1e293b;"><strong>Division:</strong> ${safeDivision}</p>
            <p style="margin:0;font-size:14px;color:#1e293b;"><strong>Changed at:</strong> ${escapeHtml(dateStr)} IST</p>
          </td></tr>
        </table>
        <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6;">
          If you did not make this change, please contact your Super Admin immediately.
        </p>
      </td>
    </tr>`,
    `${COMPANY_NAME} · ${APP_NAME} — Security notification.`
  );

  const text = [
    `Hi ${userName},`,
    `Your password was changed on ${dateStr} IST.`,
    `Division: ${divisionName ?? "—"}`,
    `If you did not make this change, contact your Super Admin immediately.`,
  ].join("\n\n");

  return sendEmail({ to: toEmail, subject, html, text });
}

/**
 * Notifies Super Admins that a user changed their password.
 */
export async function sendPasswordChangedAdminAlert(
  toEmails: string[],
  userName: string,
  userEmail: string,
  divisionName: string | null,
  changedAt: Date
): Promise<{ ok: boolean; error?: string }> {
  if (toEmails.length === 0) return { ok: true };
  const subject = `Password changed — ${userName} (${userEmail})`;
  const safeUser = escapeHtml(userName);
  const safeEmail = escapeHtml(userEmail);
  const safeDivision = escapeHtml(divisionName ?? "—");
  const dateStr = changedAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

  const html = emailShell(
    `
    <tr>
      <td style="background:linear-gradient(135deg,#7c3aed 0%,#a855f7 100%);padding:32px 40px;">
        <p style="margin:0;font-size:13px;font-weight:600;letter-spacing:0.08em;color:#ddd6fe;text-transform:uppercase;">Admin Alert · ${COMPANY_NAME}</p>
        <h1 style="margin:10px 0 0;font-size:24px;font-weight:700;color:#ffffff;line-height:1.3;">User Password Changed</h1>
      </td>
    </tr>
    <tr>
      <td style="padding:36px 40px 32px;">
        <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6;">
          The following user has changed their account password:
        </p>
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:24px;">
          <tr><td style="padding:20px 24px;">
            <p style="margin:0 0 4px;font-size:14px;color:#1e293b;"><strong>Name:</strong> ${safeUser}</p>
            <p style="margin:0 0 4px;font-size:14px;color:#1e293b;"><strong>Email:</strong> ${safeEmail}</p>
            <p style="margin:0 0 4px;font-size:14px;color:#1e293b;"><strong>Division:</strong> ${safeDivision}</p>
            <p style="margin:0;font-size:14px;color:#1e293b;"><strong>Changed at:</strong> ${escapeHtml(dateStr)} IST</p>
          </td></tr>
        </table>
        <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6;">
          No action is required. This is an automatic security audit notification.
        </p>
      </td>
    </tr>`,
    `${COMPANY_NAME} · ${APP_NAME} — Admin security audit.`
  );

  const text = [
    `[Admin Alert] User password changed`,
    `Name: ${userName}`,
    `Email: ${userEmail}`,
    `Division: ${divisionName ?? "—"}`,
    `Changed at: ${dateStr} IST`,
    `No action required.`,
  ].join("\n\n");

  return sendEmail({ to: toEmails, subject, html, text });
}
