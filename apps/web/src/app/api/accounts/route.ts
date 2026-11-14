import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withRole } from "@/lib/with-auth";

const TZ = "Asia/Kolkata";
const dayKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ });
const money = (n: number) => Math.round(n * 100) / 100;

/** Commercial view for Accounts: quotes, deals, rates, payment terms and GST gaps. Filters: days, from, to, divisionId, organizationId. */
export async function GET(req: Request) {
  const auth = await withRole(["ACCOUNTS", "SUPER_ADMIN", "MANAGING_DIRECTOR"]);
  if (auth.response) return auth.response;
  const sp = new URL(req.url).searchParams;

  const ok = (v: string | null) => (v && !Number.isNaN(new Date(v).getTime()) ? v : undefined);
  const from = ok(sp.get("from"));
  const to = ok(sp.get("to"));
  const preset = [7, 15, 30, 90, 180, 365].includes(Number(sp.get("days"))) ? Number(sp.get("days")) : 30;
  const end = to ? new Date(`${to}T23:59:59.999+05:30`) : new Date();
  const start = from ? new Date(`${from}T00:00:00+05:30`) : new Date(end.getTime() - preset * 864e5);
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 864e5));
  const divisionId = Number(sp.get("divisionId")) || undefined;
  const organizationId = Number(sp.get("organizationId")) || undefined;

  const rows = await prisma.order.findMany({
    where: { enquiryDate: { gte: start, lte: end }, ...(divisionId ? { divisionId } : {}), ...(organizationId ? { createdBy: { organizationId } } : {}) },
    orderBy: { enquiryDate: "desc" },
    take: 5000,
    select: {
      id: true, orderNumber: true, status: true, enquiryDate: true, customerName: true, companyName: true, gstNumber: true, gstCopyUrl: true,
      pricePerUnit: true, priceUnit: true, quantity: true, paymentTerms: true, deliveryTime: true, pricedAt: true,
      clientResponse: true, closedAt: true, division: { select: { name: true } },
    },
  });

  const live = rows.filter((r) => r.status !== "CANCELLED");
  const quotes = live.filter((r) => r.pricedAt);
  const accepted = live.filter((r) => r.clientResponse === "ACCEPTED");
  const declined = live.filter((r) => r.clientResponse === "DECLINED");
  const negotiating = live.filter((r) => r.status === "PRICED" && r.clientResponse === "NEGOTIATING");
  const awaiting = live.filter((r) => r.status === "PRICED" && !r.clientResponse);
  const decided = accepted.length + declined.length;

  // Rates by unit
  const byUnit = new Map<string, number[]>();
  quotes.forEach((r) => { if (r.pricePerUnit && r.priceUnit) (byUnit.get(r.priceUnit) ?? byUnit.set(r.priceUnit, []).get(r.priceUnit)!).push(Number(r.pricePerUnit)); });
  const rates = [...byUnit.entries()].map(([unit, v]) => ({ unit, quotes: v.length, avg: money(v.reduce((a, b) => a + b, 0) / v.length), min: money(Math.min(...v)), max: money(Math.max(...v)) })).sort((a, b) => b.quotes - a.quotes);

  // Payment terms mix
  const terms = new Map<string, { label: string; n: number }>();
  quotes.forEach((r) => {
    const raw = (r.paymentTerms ?? "").trim();
    const key = raw ? raw.toLowerCase() : "(none)";
    const cur = terms.get(key) ?? { label: raw || "Not specified", n: 0 };
    cur.n++;
    terms.set(key, cur);
  });
  const sortedTerms = [...terms.values()].sort((a, b) => b.n - a.n);
  const paymentTerms = [
    ...sortedTerms.slice(0, 5).map((t, i) => ({ key: `t${i}`, label: t.label, value: t.n })),
    ...(sortedTerms.length > 5 ? [{ key: "other", label: "Other", value: sortedTerms.slice(5).reduce((a, b) => a + b.n, 0) }] : []),
  ];

  // Trend: quotes issued vs deals accepted per day
  const points = Math.min(days + 1, 120);
  const trend = Array.from({ length: points }, (_, i) => {
    const d = new Date(end.getTime() - (points - 1 - i) * 864e5);
    return { date: dayKey(d), label: d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: TZ }), quotes: 0, accepted: 0 };
  });
  const ti = new Map(trend.map((t, i) => [t.date, i]));
  quotes.forEach((r) => { const i = ti.get(dayKey(r.pricedAt!)); if (i !== undefined) trend[i].quotes++; });
  accepted.forEach((r) => { const i = ti.get(dayKey(r.closedAt ?? r.enquiryDate)); if (i !== undefined) trend[i].accepted++; });

  // Outcome by division
  const div = new Map<string, { name: string; accepted: number; negotiating: number; declined: number; awaiting: number }>();
  const slot = (n: string) => div.get(n) ?? div.set(n, { name: n, accepted: 0, negotiating: 0, declined: 0, awaiting: 0 }).get(n)!;
  accepted.forEach((r) => slot(r.division.name).accepted++);
  negotiating.forEach((r) => slot(r.division.name).negotiating++);
  declined.forEach((r) => slot(r.division.name).declined++);
  awaiting.forEach((r) => slot(r.division.name).awaiting++);

  const daysToClose = accepted.filter((r) => r.closedAt).map((r) => (r.closedAt!.getTime() - r.enquiryDate.getTime()) / 864e5);
  const open = live.filter((r) => r.status === "PLACED" || r.status === "PRICED");
  const gstMissing = open.filter((r) => !r.gstNumber);

  return NextResponse.json({
    days,
    kpis: {
      quotes: quotes.length,
      accepted: accepted.length,
      declined: declined.length,
      acceptRate: decided ? Math.round((accepted.length / decided) * 100) : null,
      awaiting: awaiting.length + negotiating.length,
      avgDaysToClose: daysToClose.length ? Math.round((daysToClose.reduce((a, b) => a + b, 0) / daysToClose.length) * 10) / 10 : null,
      gstMissing: gstMissing.length,
      gstCopyMissing: open.filter((r) => r.gstNumber && !r.gstCopyUrl).length,
    },
    trend,
    rates,
    paymentTerms,
    divisionOutcome: [...div.values()].sort((a, b) => b.accepted + b.negotiating + b.declined + b.awaiting - (a.accepted + a.negotiating + a.declined + a.awaiting)),
    acceptedDeals: accepted
      .sort((a, b) => (b.closedAt?.getTime() ?? 0) - (a.closedAt?.getTime() ?? 0))
      .slice(0, 8)
      .map((r) => ({ id: r.id, orderNumber: r.orderNumber, client: r.companyName || r.customerName, division: r.division.name, rate: r.pricePerUnit, unit: r.priceUnit, quantity: r.quantity, paymentTerms: r.paymentTerms, deliveryTime: r.deliveryTime, closedAt: r.closedAt })),
    gstGaps: gstMissing.slice(0, 8).map((r) => ({ id: r.id, orderNumber: r.orderNumber, client: r.companyName || r.customerName, division: r.division.name, status: r.status, enquiryDate: r.enquiryDate })),
  });
}
