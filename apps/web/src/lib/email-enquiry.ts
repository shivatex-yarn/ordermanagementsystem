import { prisma } from "@/lib/db";
import { sendEmail, sendEmailsThrottled } from "@/lib/email";
import { APP_NAME, COMPANY_NAME } from "@/lib/branding";

const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "") || "http://localhost:3000";

export type EnquiryMail = {
  id: number; orderNumber: string; client: string; contact: string; division: string; enquiryDate: Date;
  isSample: boolean; productDetails: string | null; phone: string | null; email: string | null; loggedBy: string;
};
export type Audience = "admin" | "creator";

const fmtDate = (d: Date) => d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

function row(label: string, value: string): string {
  return `<tr>
    <td style="padding:11px 0;border-bottom:1px solid #eef0f4;font-size:13px;color:#667085;width:38%;vertical-align:top;">${esc(label)}</td>
    <td style="padding:11px 0;border-bottom:1px solid #eef0f4;font-size:14px;font-weight:600;color:#101828;vertical-align:top;">${value}</td>
  </tr>`;
}

function step(n: string, title: string, active: boolean): string {
  return `<td align="center" style="width:33%;vertical-align:top;padding:0 4px;">
    <div style="width:30px;height:30px;line-height:30px;border-radius:15px;margin:0 auto 8px;font-size:13px;font-weight:700;${active ? "background:#4f46e5;color:#ffffff;" : "background:#eef0ff;color:#4f46e5;"}">${n}</div>
    <div style="font-size:12px;font-weight:600;color:${active ? "#101828" : "#667085"};line-height:1.35;">${esc(title)}</div>
  </td>`;
}

/** Modern, table-based (email-client safe) HTML for "enquiry created". */
export function renderEnquiryCreatedEmail(e: EnquiryMail, audience: Audience): { subject: string; html: string; text: string } {
  const base = appUrl();
  const link = `${base}/orders/${e.id}`;
  const logo = `${base}/company-logo.png`;
  const isAdmin = audience === "admin";
  const subject = isAdmin ? `New enquiry ${e.orderNumber} · ${e.client}` : `Your enquiry ${e.orderNumber} has been logged`;
  const headline = isAdmin ? `${esc(e.loggedBy)} logged a new enquiry` : "Your enquiry is logged";
  const lead = isAdmin
    ? `A new enquiry for <b style="color:#101828;">${esc(e.client)}</b> is in the system. Pricing can now be added.`
    : `Thanks, we have it. <b style="color:#101828;">${esc(e.client)}</b> is now in the system. Next, add the pricing on the enquiry.`;
  const pill = (txt: string, bg: string, fg: string) => `<span style="display:inline-block;padding:3px 11px;border-radius:999px;background:${bg};color:${fg};font-size:12px;font-weight:700;">${txt}</span>`;

  const details = [
    row("Client", esc(e.client)),
    e.contact && e.contact !== e.client ? row("Contact person", esc(e.contact)) : "",
    row("Division", esc(e.division)),
    row("Enquiry date", esc(fmtDate(e.enquiryDate))),
    row("Sample", e.isSample ? pill("Sample requested", "#eef0ff", "#4338ca") : pill("Full order", "#f2f4f7", "#475467")),
    e.phone ? row("Phone", esc(e.phone)) : "",
    e.email ? row("Email", esc(e.email)) : "",
    isAdmin ? row("Logged by", esc(e.loggedBy)) : "",
  ].join("");

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f3f4fb;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(e.orderNumber)} · ${esc(e.client)} · ${esc(e.division)}. ${isAdmin ? "Pricing is yet to be added." : "Next, add the pricing on the enquiry."}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4fb;padding:32px 12px;font-family:${FONT};-webkit-font-smoothing:antialiased;">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #e6e8f2;">
    <tr><td style="background:#4f46e5;padding:22px 28px;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="width:44px;height:44px;background:#ffffff;border-radius:12px;text-align:center;vertical-align:middle;"><img src="${logo}" width="34" height="34" alt="" style="display:inline-block;border:0;vertical-align:middle;"></td>
        <td style="padding-left:14px;vertical-align:middle;">
          <div style="font-size:16px;font-weight:800;color:#ffffff;letter-spacing:-0.01em;">${esc(COMPANY_NAME)}</div>
          <div style="font-size:11px;font-weight:600;color:#c7d2fe;letter-spacing:0.14em;text-transform:uppercase;margin-top:2px;">${esc(APP_NAME)}</div>
        </td>
      </tr></table>
    </td></tr>

    <tr><td style="padding:34px 28px 8px;">
      <span style="display:inline-block;padding:4px 12px;border-radius:999px;background:#eef0ff;color:#4338ca;font-size:11px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;">${isAdmin ? "New enquiry" : "Enquiry logged"}</span>
      <div style="font-size:34px;font-weight:800;color:#101828;letter-spacing:-0.025em;margin:14px 0 6px;line-height:1.1;">${esc(e.orderNumber)}</div>
      <div style="font-size:18px;font-weight:700;color:#344054;margin-bottom:12px;">${headline}</div>
      <p style="margin:0;font-size:15px;line-height:1.65;color:#667085;">${lead}</p>
    </td></tr>

    <tr><td style="padding:20px 28px 4px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafaff;border:1px solid #e8e8f6;border-radius:14px;"><tr><td style="padding:6px 20px 10px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${details}</table>
      </td></tr></table>
    </td></tr>

    ${e.productDetails ? `<tr><td style="padding:16px 28px 0;">
      <div style="font-size:11px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:#98a2b3;margin-bottom:8px;">Requirement</div>
      <div style="border-left:3px solid #4f46e5;background:#f8f9fc;border-radius:0 12px 12px 0;padding:14px 16px;font-size:14px;line-height:1.6;color:#344054;white-space:pre-wrap;">${esc(e.productDetails.length > 600 ? e.productDetails.slice(0, 600) + "…" : e.productDetails)}</div>
    </td></tr>` : ""}

    <tr><td style="padding:26px 28px 4px;">
      <div style="font-size:11px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:#98a2b3;margin-bottom:14px;">What happens next</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        ${step("1", "Marketing adds pricing", true)}${step("2", e.isSample ? "Sample goes out" : "Client is quoted", false)}${step("3", "Client feedback, then closed", false)}
      </tr></table>
    </td></tr>

    <tr><td align="center" style="padding:30px 28px 34px;">
      <a href="${link}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 34px;border-radius:12px;">View enquiry</a>
      <div style="margin-top:14px;font-size:12px;color:#98a2b3;word-break:break-all;">Or open ${esc(link)}</div>
    </td></tr>

    <tr><td style="background:#fafafd;border-top:1px solid #eef0f4;padding:18px 28px;">
      <div style="font-size:12px;line-height:1.6;color:#98a2b3;">This is an automated message from ${esc(COMPANY_NAME)}. Please do not reply to this email.</div>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;

  const text = [
    subject, "",
    `${e.orderNumber} · ${e.client} · ${e.division}`,
    `Enquiry date: ${fmtDate(e.enquiryDate)}`,
    `Sample: ${e.isSample ? "Yes" : "No"}`,
    isAdmin ? `Logged by: ${e.loggedBy}` : "",
    e.productDetails ? `\nRequirement:\n${e.productDetails}` : "",
    `\nView the enquiry: ${link}`,
  ].filter(Boolean).join("\n");
  return { subject, html, text };
}

/** Emails the Super admin(s) and the Marketing person who logged the enquiry. Never throws. */
export async function sendEnquiryCreatedEmails(orderId: number): Promise<void> {
  try {
    const o = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true, orderNumber: true, enquiryDate: true, customerName: true, companyName: true, customerPhone: true, customerEmail: true,
        productDetails: true, isSample: true, division: { select: { name: true } },
        createdBy: { select: { name: true, email: true, active: true } },
      },
    });
    if (!o) return;
    const admins = await prisma.user.findMany({ where: { role: "SUPER_ADMIN", active: true }, select: { email: true } });
    const data: EnquiryMail = {
      id: o.id, orderNumber: o.orderNumber, client: o.companyName || o.customerName, contact: o.customerName, division: o.division.name,
      enquiryDate: o.enquiryDate, isSample: o.isSample, productDetails: o.productDetails, phone: o.customerPhone, email: o.customerEmail, loggedBy: o.createdBy.name,
    };
    const sent = new Set<string>();
    const sends: Array<() => Promise<{ ok: boolean; error?: string }>> = [];
    const queue = (to: string, audience: Audience) => {
      const key = to.trim().toLowerCase();
      if (!key || sent.has(key)) return;
      sent.add(key);
      const m = renderEnquiryCreatedEmail(data, audience);
      sends.push(() => sendEmail({ to, subject: m.subject, html: m.html, text: m.text }));
    };
    if (o.createdBy.active) queue(o.createdBy.email, "creator"); // the person who logged it gets the confirmation version
    admins.forEach((a) => queue(a.email, "admin"));
    await sendEmailsThrottled(sends);
  } catch (err) {
    console.error("[email] enquiry-created emails failed:", err);
  }
}
