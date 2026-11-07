import { APP_NAME, COMPANY_NAME } from "@/lib/branding";

const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "") || "http://localhost:3000";
const fmt = (d: Date) => d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

export type InactivityMail = {
  person: { name: string; email: string; divisions: string[]; joinedAt: Date };
  days: number;
  thresholdDays: number;
  /** null = this person has never entered an enquiry */
  last: { orderNumber: string; orderId: number; client: string; division: string; enquiryDate: Date; loggedAt: Date } | null;
};

const initials = (n: string) => n.split(" ").map((x) => x[0]).join("").slice(0, 2).toUpperCase();

function row(label: string, value: string): string {
  return `<tr>
    <td style="padding:11px 0;border-bottom:1px solid #eef0f4;font-size:13px;color:#667085;width:36%;vertical-align:top;">${esc(label)}</td>
    <td style="padding:11px 0;border-bottom:1px solid #eef0f4;font-size:14px;font-weight:600;color:#101828;vertical-align:top;">${value}</td>
  </tr>`;
}

/** Modern, table-based (email-client safe) alert for "no enquiries entered in N days". */
export function renderInactivityEmail(m: InactivityMail): { subject: string; html: string; text: string } {
  const base = appUrl();
  const logo = `${base}/company-logo.png`;
  const link = `${base}/team`;
  const never = !m.last;
  const subject = never
    ? `Nil enquiries: ${m.person.name} has not entered any enquiry`
    : `Nil enquiries for ${m.days} days: ${m.person.name}`;
  const since = never ? m.person.joinedAt : m.last!.loggedAt;

  const last = never
    ? `<div style="font-size:14px;line-height:1.6;color:#344054;">No enquiry has ever been entered by ${esc(m.person.name)}. Their account was created on <b>${esc(fmt(m.person.joinedAt))}</b>.</div>`
    : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${[
        row("Enquiry", `<span style="color:#4338ca;">${esc(m.last!.orderNumber)}</span>`),
        row("Client", esc(m.last!.client)),
        row("Division", esc(m.last!.division)),
        row("Enquiry date", esc(fmt(m.last!.enquiryDate))),
        row("Entered on", esc(fmt(m.last!.loggedAt))),
      ].join("")}</table>`;

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f3f4fb;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${never ? "No enquiry has been entered yet." : `Last entry was on ${esc(fmt(m.last!.loggedAt))}.`} ${esc(m.person.name)} · ${esc(m.person.divisions.join(", ") || "no division")}</div>
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

    <tr><td style="padding:34px 28px 6px;">
      <span style="display:inline-block;padding:4px 12px;border-radius:999px;background:#fff1f2;color:#be123c;font-size:11px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;">Inactivity alert</span>
      <div style="font-size:30px;font-weight:800;color:#101828;letter-spacing:-0.025em;margin:14px 0 6px;line-height:1.15;">Nil enquiries entered</div>
      <p style="margin:0;font-size:15px;line-height:1.65;color:#667085;"><b style="color:#101828;">${esc(m.person.name)}</b> has not entered any enquiry ${never ? "since joining" : `in the last <b style="color:#101828;">${m.days} days</b>`}. The alert limit is ${m.thresholdDays} days.</p>
    </td></tr>

    <tr><td style="padding:20px 28px 4px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff7ed;border:1px solid #fed7aa;border-radius:14px;"><tr>
        <td style="padding:18px 20px;width:50%;border-right:1px solid #fed7aa;">
          <div style="font-size:11px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:#c2410c;">Days without an entry</div>
          <div style="font-size:40px;font-weight:800;color:#9a3412;line-height:1.1;margin-top:4px;">${m.days}</div>
        </td>
        <td style="padding:18px 20px;vertical-align:top;">
          <div style="font-size:11px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:#c2410c;">${never ? "Joined" : "Last entry"}</div>
          <div style="font-size:18px;font-weight:800;color:#9a3412;line-height:1.3;margin-top:8px;">${esc(fmt(since))}</div>
        </td>
      </tr></table>
    </td></tr>

    <tr><td style="padding:22px 28px 4px;">
      <div style="font-size:11px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:#98a2b3;margin-bottom:10px;">Marketing person</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafaff;border:1px solid #e8e8f6;border-radius:14px;"><tr><td style="padding:16px 18px;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="width:44px;height:44px;border-radius:22px;background:#eef0ff;color:#4338ca;font-size:15px;font-weight:800;text-align:center;vertical-align:middle;">${esc(initials(m.person.name))}</td>
          <td style="padding-left:14px;vertical-align:middle;">
            <div style="font-size:16px;font-weight:700;color:#101828;">${esc(m.person.name)}</div>
            <div style="font-size:13px;color:#667085;margin-top:2px;">${esc(m.person.email)}</div>
            <div style="font-size:12px;color:#4338ca;font-weight:600;margin-top:3px;">${esc(m.person.divisions.join("  ·  ") || "No division mapped")}</div>
          </td>
        </tr></table>
      </td></tr></table>
    </td></tr>

    <tr><td style="padding:22px 28px 4px;">
      <div style="font-size:11px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:#98a2b3;margin-bottom:10px;">${never ? "Entries" : "Last entry details"}</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e8e8f6;border-radius:14px;"><tr><td style="padding:6px 20px 10px;">${last}</td></tr></table>
    </td></tr>

    <tr><td align="center" style="padding:30px 28px 34px;">
      <a href="${link}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 34px;border-radius:12px;">View team</a>
      <div style="margin-top:14px;font-size:12px;color:#98a2b3;word-break:break-all;">Or open ${esc(link)}</div>
    </td></tr>

    <tr><td style="background:#fafafd;border-top:1px solid #eef0f4;padding:18px 28px;">
      <div style="font-size:12px;line-height:1.6;color:#98a2b3;">Sent to the Super admin and the Managing director when a Marketing person goes ${m.thresholdDays} days without logging an enquiry. A reminder follows weekly while it continues. This is an automated message from ${esc(COMPANY_NAME)}.</div>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;

  const text = [
    subject, "",
    `${m.person.name} (${m.person.email}) has not entered any enquiry ${never ? "since joining" : `in ${m.days} days`}.`,
    `Divisions: ${m.person.divisions.join(", ") || "none"}`,
    never
      ? `Account created: ${fmt(m.person.joinedAt)}`
      : `Last entry: ${m.last!.orderNumber} · ${m.last!.client} · ${m.last!.division}, entered ${fmt(m.last!.loggedAt)} (enquiry date ${fmt(m.last!.enquiryDate)})`,
    "", `View team: ${link}`,
  ].join("\n");
  return { subject, html, text };
}
