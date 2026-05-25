import { Resend } from "resend";
import { getNotificationShortLabel } from "@/lib/notification-labels";

const apiKey = process.env.RESEND_API_KEY;
const from = process.env.RESEND_FROM ?? "Enquiry Management <onboarding@resend.dev>";

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
export async function sendEnquiryNotificationEmail(
  toEmail: string,
  toName: string,
  orderNumber: string,
  eventType: string,
  summary: string
): Promise<{ ok: boolean; error?: string }> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const subject = `Enquiry ${orderNumber}: ${eventType}`;
  const safeName = escapeHtml(toName);
  const safeSummary = escapeHtml(summary).replace(/\r\n|\n/g, "<br/>");
  const ordersUrl = escapeHtml(`${appUrl}/orders`);

  const inner = `
        <tr>
          <td style="height:4px;background:linear-gradient(90deg,#6366f1,#8b5cf6);font-size:0;line-height:0;">&nbsp;</td>
        </tr>
        <tr>
          <td style="padding:36px 32px 32px;">
            <p style="margin:0 0 6px;font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#a1a1aa;">Enquiry activity</p>
            <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;letter-spacing:-0.02em;color:#18181b;line-height:1.25;">${escapeHtml(getNotificationShortLabel(eventType))}</h1>
            <p style="margin:0 0 24px;font-size:14px;color:#71717a;line-height:1.5;">Hi ${safeName}, here&rsquo;s an update on <strong style="color:#27272a;">${escapeHtml(orderNumber)}</strong>.</p>
            <div style="background:linear-gradient(135deg,#f5f3ff 0%,#faf5ff 100%);border:1px solid #e9d5ff;border-radius:12px;padding:18px 20px;margin:0 0 28px;">
              <p style="margin:0;font-size:15px;line-height:1.6;color:#3f3f46;">${safeSummary}</p>
            </div>
            <a href="${ordersUrl}" style="display:inline-block;background:#4f46e5;color:#ffffff !important;font-size:14px;font-weight:600;padding:12px 22px;text-decoration:none;border-radius:10px;box-shadow:0 2px 8px rgba(79,70,229,0.35);">View enquiries</a>
          </td>
        </tr>`;

  const html = emailShell(inner, "Enquiry Management System");
  const text = `Enquiry ${orderNumber}: ${eventType}\n\n${summary}\n\nView: ${appUrl}/orders`;
  return sendEmail({ to: toEmail, subject, html, text });
}

/** Email to the assigned supervisor when the division head completes enquiry handoff. */
export async function sendSupervisorEnquiryHandoffEmail(
  toEmail: string,
  toName: string,
  payload: {
    orderNumber: string;
    companyName: string | null;
    description: string | null;
    divisionName: string;
    acceptanceReason: string | null;
    developmentKind: "new" | "existing";
    developmentBody: string;
    orderUrl: string;
  }
): Promise<{ ok: boolean; error?: string }> {
  const subject = `You have been assigned enquiry ${payload.orderNumber}`;
  const safeName = escapeHtml(toName);
  const devLabel = payload.developmentKind === "new" ? "New development" : "Existing development";
  const inner = `
        <tr>
          <td style="height:4px;background:linear-gradient(90deg,#0f766e,#6366f1);font-size:0;line-height:0;">&nbsp;</td>
        </tr>
        <tr>
          <td style="padding:36px 32px 32px;">
            <p style="margin:0 0 6px;font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#a1a1aa;">Division assignment</p>
            <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#18181b;">Hi ${safeName}</h1>
            <p style="margin:0 0 16px;font-size:14px;color:#52525b;line-height:1.5;">You have been assigned <strong>${escapeHtml(payload.orderNumber)}</strong> in <strong>${escapeHtml(payload.divisionName)}</strong>.</p>
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 20px;font-size:14px;color:#3f3f46;">
              <tr><td style="padding:6px 0;color:#71717a;width:140px;">Company</td><td style="padding:6px 0;">${escapeHtml(payload.companyName ?? "—")}</td></tr>
              <tr><td style="padding:6px 0;color:#71717a;vertical-align:top;">Description</td><td style="padding:6px 0;">${escapeHtml(payload.description ?? "—").replace(/\r\n|\n/g, "<br/>")}</td></tr>
              <tr><td style="padding:6px 0;color:#71717a;vertical-align:top;">Head acceptance</td><td style="padding:6px 0;">${escapeHtml(payload.acceptanceReason ?? "—").replace(/\r\n|\n/g, "<br/>")}</td></tr>
              <tr><td style="padding:6px 0;color:#71717a;">${escapeHtml(devLabel)}</td><td style="padding:6px 0;">${escapeHtml(payload.developmentBody).replace(/\r\n|\n/g, "<br/>")}</td></tr>
            </table>
            <a href="${escapeHtml(payload.orderUrl)}" style="display:inline-block;background:#0f766e;color:#ffffff !important;font-size:14px;font-weight:600;padding:12px 22px;text-decoration:none;border-radius:10px;">Open enquiry</a>
          </td>
        </tr>`;
  const html = emailShell(inner, "Enquiry Management System");
  const text = `${subject}\n\nCompany: ${payload.companyName ?? "—"}\n\n${payload.description ?? ""}\n\n${devLabel}: ${payload.developmentBody}\n\nOpen: ${payload.orderUrl}`;
  return sendEmail({ to: toEmail, subject, html, text });
}

export interface SlaBreachEmailPayload {
  orderNumber: string;
  companyName: string | null;
  description: string | null;
  status: string;
  slaDeadlineFormatted: string | null;
  breachDivisionName: string;
  createdByLine: string;
  currentDivisionName: string;
  previousDivisionName: string | null;
  acceptedByLine: string | null;
  receivedByLine: string | null;
  transferPipeline: { at: string; from: string; to: string; by: string; reason: string }[];
  customFieldsJson: string | null;
  orderDetailUrl: string;
}

/**
 * SLA breach: full enquiry + transfer pipeline. Call only for Super Admin + MD recipients.
 */
export async function sendSlaBreachDetailEmail(
  toEmail: string,
  toName: string,
  payload: SlaBreachEmailPayload
): Promise<{ ok: boolean; error?: string }> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const subject = `SLA breach: ${payload.orderNumber}${payload.companyName ? ` · ${payload.companyName}` : ""}`;

  const desc = payload.description?.trim()
    ? escapeHtml(payload.description).replace(/\r\n|\n/g, "<br/>")
    : "—";
  const company = payload.companyName?.trim() ? escapeHtml(payload.companyName) : "—";
  const lc = "padding:14px 18px;border-bottom:1px solid #f4f4f5;font-size:11px;font-weight:600;color:#71717a;text-transform:uppercase;letter-spacing:0.07em;width:34%;vertical-align:top;background:#fafafa;";
  const vc = "padding:14px 18px;border-bottom:1px solid #f4f4f5;font-size:14px;color:#18181b;line-height:1.5;vertical-align:top;";
  const em = (s: string | null | undefined) => (s ? escapeHtml(s) : "—");

  const pipelineRows =
    payload.transferPipeline.length === 0
      ? `<tr><td colspan="4" style="padding:22px 16px;font-size:14px;color:#a1a1aa;text-align:center;background:#fafafa;">No transfers recorded yet.</td></tr>`
      : payload.transferPipeline
          .map(
            (t, i) => `<tr style="background:${i % 2 === 0 ? "#ffffff" : "#fafafa"};">
<td style="padding:12px 14px;border-bottom:1px solid #f4f4f5;font-size:12px;color:#52525b;vertical-align:top;white-space:nowrap;">${escapeHtml(t.at)}</td>
<td style="padding:12px 14px;border-bottom:1px solid #f4f4f5;font-size:13px;color:#18181b;vertical-align:top;"><span style="color:#a1a1aa;">${escapeHtml(t.from)}</span> <span style="color:#d4d4d8;">→</span> <strong>${escapeHtml(t.to)}</strong></td>
<td style="padding:12px 14px;border-bottom:1px solid #f4f4f5;font-size:13px;color:#3f3f46;vertical-align:top;">${escapeHtml(t.by)}</td>
<td style="padding:12px 14px;border-bottom:1px solid #f4f4f5;font-size:13px;color:#52525b;vertical-align:top;line-height:1.45;">${escapeHtml(t.reason)}</td>
</tr>`
          )
          .join("");

  const customBlock =
    payload.customFieldsJson && payload.customFieldsJson !== "{}"
      ? `<p style="margin:28px 0 10px;font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#a1a1aa;">Custom fields</p>
<div style="background:#18181b;padding:16px 18px;border-radius:12px;border:1px solid #27272a;">
<pre style="margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:12px;line-height:1.5;color:#e4e4e7;white-space:pre-wrap;word-break:break-word;">${escapeHtml(payload.customFieldsJson)}</pre>
</div>`
      : "";

  const ordersListUrl = escapeHtml(`${appUrl}/orders`);
  const detailUrl = escapeHtml(payload.orderDetailUrl);

  const inner = `
        <tr>
          <td style="height:4px;background:linear-gradient(90deg,#f59e0b,#ea580c);font-size:0;line-height:0;">&nbsp;</td>
        </tr>
        <tr>
          <td style="padding:32px 28px 28px;">
            <p style="margin:0 0 8px;font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#ea580c;">SLA breach</p>
            <h1 style="margin:0 0 12px;font-size:24px;font-weight:700;letter-spacing:-0.03em;color:#18181b;line-height:1.2;">48-hour deadline exceeded</h1>
            <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#52525b;">Hi ${escapeHtml(toName)}, this enquiry missed its SLA. Breach recorded for <strong style="color:#18181b;">${escapeHtml(payload.breachDivisionName)}</strong> (owning division when detected).</p>

            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:separate;border-spacing:0;border:1px solid #e4e4e7;border-radius:12px;overflow:hidden;margin:0 0 8px;">
              <tr><td colspan="2" style="padding:12px 18px;background:#fff7ed;border-bottom:1px solid #ffedd5;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#9a3412;">Enquiry details</td></tr>
              <tr><td style="${lc}">Number</td><td style="${vc}"><strong style="font-size:15px;color:#4f46e5;">${escapeHtml(payload.orderNumber)}</strong></td></tr>
              <tr><td style="${lc}">Company</td><td style="${vc}">${company}</td></tr>
              <tr><td style="${lc}">Status</td><td style="${vc}"><span style="display:inline-block;padding:4px 10px;border-radius:999px;background:#f4f4f5;font-size:12px;font-weight:600;color:#3f3f46;">${escapeHtml(payload.status)}</span></td></tr>
              <tr><td style="${lc}">SLA deadline (UTC)</td><td style="${vc}">${em(payload.slaDeadlineFormatted)}</td></tr>
              <tr><td style="${lc}">Created by</td><td style="${vc}">${escapeHtml(payload.createdByLine)}</td></tr>
              <tr><td style="${lc}">Current division</td><td style="${vc}">${escapeHtml(payload.currentDivisionName)}</td></tr>
              <tr><td style="${lc}">Previous division</td><td style="${vc}">${em(payload.previousDivisionName)}</td></tr>
              <tr><td style="${lc}">Accepted by</td><td style="${vc}">${em(payload.acceptedByLine)}</td></tr>
              <tr><td style="${lc}">Received by</td><td style="${vc}">${em(payload.receivedByLine)}</td></tr>
            </table>

            <p style="margin:24px 0 10px;font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#a1a1aa;">Description</p>
            <div style="background:#fafafa;border:1px solid #e4e4e7;border-radius:12px;padding:18px 20px;font-size:14px;line-height:1.65;color:#3f3f46;">${desc}</div>
            ${customBlock}

            <p style="margin:28px 0 12px;font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#a1a1aa;">Pipeline · transfers</p>
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:separate;border-spacing:0;border:1px solid #e4e4e7;border-radius:12px;overflow:hidden;">
              <thead>
                <tr style="background:linear-gradient(180deg,#fafafa 0%,#f4f4f5 100%);">
                  <th style="padding:11px 14px;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#71717a;text-align:left;border-bottom:1px solid #e4e4e7;">When (UTC)</th>
                  <th style="padding:11px 14px;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#71717a;text-align:left;border-bottom:1px solid #e4e4e7;">Route</th>
                  <th style="padding:11px 14px;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#71717a;text-align:left;border-bottom:1px solid #e4e4e7;">By</th>
                  <th style="padding:11px 14px;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#71717a;text-align:left;border-bottom:1px solid #e4e4e7;">Reason</th>
                </tr>
              </thead>
              <tbody>${pipelineRows}</tbody>
            </table>

            <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:28px;">
              <tr>
                <td style="padding-right:10px;">
                  <a href="${detailUrl}" style="display:inline-block;background:#4f46e5;color:#ffffff !important;font-size:14px;font-weight:600;padding:12px 22px;text-decoration:none;border-radius:10px;box-shadow:0 2px 8px rgba(79,70,229,0.35);">Open enquiry</a>
                </td>
                <td>
                  <a href="${ordersListUrl}" style="display:inline-block;background:#ffffff;color:#3f3f46 !important;font-size:14px;font-weight:600;padding:12px 20px;text-decoration:none;border-radius:10px;border:1px solid #e4e4e7;">All enquiries</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;

  const html = emailShell(inner, "Enquiry Management System · SLA monitoring", 640);

  const transfersText =
    payload.transferPipeline.length === 0
      ? "(no transfers)"
      : payload.transferPipeline
          .map((t) => `- ${t.at} | ${t.from} → ${t.to} | ${t.by} | ${t.reason}`)
          .join("\n");

  const text = [
    `SLA breach: ${payload.orderNumber}`,
    `Breach division (at detection): ${payload.breachDivisionName}`,
    `Company: ${payload.companyName ?? "—"}`,
    `Status: ${payload.status}`,
    `SLA deadline (UTC): ${payload.slaDeadlineFormatted ?? "—"}`,
    `Created by: ${payload.createdByLine}`,
    `Current division: ${payload.currentDivisionName}`,
    `Description:\n${payload.description ?? "—"}`,
    `Transfers:\n${transfersText}`,
    `Open: ${payload.orderDetailUrl}`,
  ].join("\n\n");

  return sendEmail({ to: toEmail, subject, html, text });
}

// ---------------------------------------------------------------------------
// Password reset emails
// ---------------------------------------------------------------------------

/**
 * Sends a password-reset confirmation link to the requesting user.
 * The `resetUrl` should be `APP_URL/reset-password?token=<plainToken>`.
 */
export async function sendPasswordResetEmail(
  toEmail: string,
  userName: string,
  resetUrl: string
): Promise<{ ok: boolean; error?: string }> {
  const subject = "Reset your password — Enquiry Management";
  const safeUser = escapeHtml(userName);
  const safeUrl = resetUrl.replace(/"/g, "&quot;");

  const html = emailShell(
    `
    <tr>
      <td style="background:linear-gradient(135deg,#1e293b 0%,#334155 100%);padding:32px 40px;">
        <p style="margin:0;font-size:13px;font-weight:600;letter-spacing:0.08em;color:#94a3b8;text-transform:uppercase;">Enquiry Management</p>
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
    "This is an automated security email from Enquiry Management. Do not reply."
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
  const subject = "Your password has been changed — Enquiry Management";
  const safeUser = escapeHtml(userName);
  const safeDivision = escapeHtml(divisionName ?? "—");
  const dateStr = changedAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

  const html = emailShell(
    `
    <tr>
      <td style="background:linear-gradient(135deg,#1e293b 0%,#334155 100%);padding:32px 40px;">
        <p style="margin:0;font-size:13px;font-weight:600;letter-spacing:0.08em;color:#94a3b8;text-transform:uppercase;">Enquiry Management</p>
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
    "Enquiry Management System — Security notification."
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
        <p style="margin:0;font-size:13px;font-weight:600;letter-spacing:0.08em;color:#ddd6fe;text-transform:uppercase;">Admin Alert · Enquiry Management</p>
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
    "Enquiry Management System — Admin security audit."
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
