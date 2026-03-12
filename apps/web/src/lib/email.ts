import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;
const from = process.env.RESEND_FROM ?? "Enquiry Management <onboarding@resend.dev>";

const resend = apiKey ? new Resend(apiKey) : null;

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
    if (process.env.NODE_ENV === "development") {
      console.log("[email] Skipped (no RESEND_API_KEY):", options.subject, "→", options.to);
    }
    return { ok: true };
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
  const html = `
    <div style="font-family: sans-serif; max-width: 560px;">
      <h2 style="color: #0f172a;">Enquiry update</h2>
      <p>Hi ${toName},</p>
      <p><strong>${subject}</strong></p>
      <p>${summary}</p>
      <p>
        <a href="${appUrl}/orders" style="display: inline-block; background: #0f172a; color: white; padding: 10px 16px; text-decoration: none; border-radius: 6px;">View enquiries</a>
      </p>
      <p style="color: #64748b; font-size: 12px;">Enquiry Management System</p>
    </div>
  `;
  const text = `Enquiry ${orderNumber}: ${eventType}\n\n${summary}\n\nView: ${appUrl}/orders`;
  return sendEmail({ to: toEmail, subject, html, text });
}
