import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withRole } from "@/lib/with-auth";

const TZ = "Asia/Kolkata";
const dayKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ });
const r1 = (n: number) => Math.round(n * 10) / 10;
const DAY = 864e5;

/** Executive roll-up for the Managing director. Filters: days, from, to, divisionId. Compares with the previous equal period. */
export async function GET(req: Request) {
  const auth = await withRole(["MANAGING_DIRECTOR", "SUPER_ADMIN"]);
  if (auth.response) return auth.response;
  const sp = new URL(req.url).searchParams;
  const ok = (v: string | null) => (v && !Number.isNaN(new Date(v).getTime()) ? v : undefined);
  const from = ok(sp.get("from"));
  const to = ok(sp.get("to"));
  const preset = [7, 30, 90, 180, 365].includes(Number(sp.get("days"))) ? Number(sp.get("days")) : 30;
  const end = to ? new Date(`${to}T23:59:59.999+05:30`) : new Date();
  const start = from ? new Date(`${from}T00:00:00+05:30`) : new Date(end.getTime() - preset * DAY);
  const span = end.getTime() - start.getTime();
  const days = Math.max(1, Math.round(span / DAY));
  const prevStart = new Date(start.getTime() - span);
  const divisionId = Number(sp.get("divisionId")) || undefined;
  const sixMonthsAgo = new Date(Date.now() - 183 * DAY);

  const rowsAll = await prisma.order.findMany({
    where: { enquiryDate: { gte: new Date(Math.min(prevStart.getTime(), sixMonthsAgo.getTime())) }, ...(divisionId ? { divisionId } : {}) },
    take: 8000,
    select: {
      id: true, orderNumber: true, status: true, enquiryDate: true, createdAt: true, customerName: true, companyName: true, isSample: true,
      sampleSentAt: true, pricedAt: true, clientResponse: true, closedAt: true,
      division: { select: { id: true, name: true } }, createdBy: { select: { name: true } }, pricedBy: { select: { name: true } },
    },
  });
  const live = rowsAll.filter((r) => r.status !== "CANCELLED");
  const cur = live.filter((r) => r.enquiryDate >= start && r.enquiryDate <= end);
  const prev = live.filter((r) => r.enquiryDate >= prevStart && r.enquiryDate < start);

  const stats = (rs: typeof live) => {
    const priced = rs.filter((r) => r.pricedAt);
    const acc = rs.filter((r) => r.clientResponse === "ACCEPTED");
    const dec = rs.filter((r) => r.clientResponse === "DECLINED");
    const hrs = priced.map((r) => (r.pricedAt!.getTime() - r.createdAt.getTime()) / 36e5);
    const close = acc.filter((r) => r.closedAt).map((r) => (r.closedAt!.getTime() - r.enquiryDate.getTime()) / DAY);
    return {
      logged: rs.length, priced: priced.length, accepted: acc.length, declined: dec.length,
      replied: rs.filter((r) => r.clientResponse).length,
      acceptRate: acc.length + dec.length ? Math.round((acc.length / (acc.length + dec.length)) * 100) : null,
      hoursToPrice: hrs.length ? r1(hrs.reduce((a, b) => a + b, 0) / hrs.length) : null,
      daysToClose: close.length ? r1(close.reduce((a, b) => a + b, 0) / close.length) : null,
      samples: rs.filter((r) => r.isSample).length,
    };
  };
  const c = stats(cur);
  const p = stats(prev);

  // Daily trend (sparkline + main chart)
  const points = Math.min(days + 1, 120);
  const trend = Array.from({ length: points }, (_, i) => {
    const d = new Date(end.getTime() - (points - 1 - i) * DAY);
    return { date: dayKey(d), label: d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: TZ }), logged: 0, priced: 0, accepted: 0 };
  });
  const ti = new Map(trend.map((t, i) => [t.date, i]));
  cur.forEach((r) => { const i = ti.get(dayKey(r.enquiryDate)); if (i !== undefined) trend[i].logged++; });
  live.forEach((r) => {
    if (r.pricedAt) { const i = ti.get(dayKey(r.pricedAt)); if (i !== undefined) trend[i].priced++; }
    if (r.clientResponse === "ACCEPTED" && r.closedAt) { const i = ti.get(dayKey(r.closedAt)); if (i !== undefined) trend[i].accepted++; }
  });

  // Division leaderboard
  const divMap = new Map<string, { name: string; logged: number; accepted: number; declined: number; open: number; hours: number[] }>();
  cur.forEach((r) => {
    const d = divMap.get(r.division.name) ?? divMap.set(r.division.name, { name: r.division.name, logged: 0, accepted: 0, declined: 0, open: 0, hours: [] }).get(r.division.name)!;
    d.logged++;
    if (r.clientResponse === "ACCEPTED") d.accepted++;
    if (r.clientResponse === "DECLINED") d.declined++;
    if (r.status === "PLACED" || r.status === "PRICED") d.open++;
    if (r.pricedAt) d.hours.push((r.pricedAt.getTime() - r.createdAt.getTime()) / 36e5);
  });
  const divisions = [...divMap.values()].map((d) => ({
    name: d.name, logged: d.logged, accepted: d.accepted, open: d.open,
    acceptRate: d.accepted + d.declined ? Math.round((d.accepted / (d.accepted + d.declined)) * 100) : null,
    hoursToPrice: d.hours.length ? r1(d.hours.reduce((a, b) => a + b, 0) / d.hours.length) : null,
  })).sort((a, b) => b.logged - a.logged);

  // Ageing of everything still open (whole book, not just the window)
  const now = Date.now();
  const buckets = [["0-2 days", 0, 2], ["3-7 days", 3, 7], ["8-14 days", 8, 14], ["15+ days", 15, 9999]] as const;
  const open = live.filter((r) => r.status === "PLACED" || r.status === "PRICED");
  const ageing = buckets.map(([label, lo, hi]) => {
    const inB = open.filter((r) => { const d = Math.floor((now - r.enquiryDate.getTime()) / DAY); return d >= lo && d <= hi; });
    return { label, needsPricing: inB.filter((r) => r.status === "PLACED").length, waiting: inB.filter((r) => r.status === "PRICED").length };
  });

  // Six-month view
  const months: { key: string; label: string; logged: number; accepted: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
    months.push({ key: dayKey(d).slice(0, 7), label: d.toLocaleDateString("en-IN", { month: "short", timeZone: TZ }), logged: 0, accepted: 0 });
  }
  const mi = new Map(months.map((m, i) => [m.key, i]));
  live.forEach((r) => {
    const i = mi.get(dayKey(r.enquiryDate).slice(0, 7)); if (i === undefined) return;
    months[i].logged++;
    if (r.clientResponse === "ACCEPTED") months[i].accepted++;
  });

  // People
  const people = new Map<string, { name: string; role: "MARKETING" | "SALES"; count: number; hours: number[] }>();
  cur.forEach((r) => {
    const m = people.get("M" + r.createdBy.name) ?? people.set("M" + r.createdBy.name, { name: r.createdBy.name, role: "MARKETING", count: 0, hours: [] }).get("M" + r.createdBy.name)!;
    m.count++;
    if (r.pricedBy) {
      const s = people.get("S" + r.pricedBy.name) ?? people.set("S" + r.pricedBy.name, { name: r.pricedBy.name, role: "SALES", count: 0, hours: [] }).get("S" + r.pricedBy.name)!;
      s.count++;
      s.hours.push((r.pricedAt!.getTime() - r.createdAt.getTime()) / 36e5);
    }
  });
  const team = [...people.values()].map((t) => ({ name: t.name, role: t.role, count: t.count, hours: t.hours.length ? r1(t.hours.reduce((a, b) => a + b, 0) / t.hours.length) : null })).sort((a, b) => b.count - a.count).slice(0, 8);

  // Clients
  const cl = new Map<string, { name: string; count: number; accepted: number }>();
  cur.forEach((r) => {
    const nm = (r.companyName || r.customerName).trim(); const k = nm.toLowerCase();
    const x = cl.get(k) ?? cl.set(k, { name: nm, count: 0, accepted: 0 }).get(k)!;
    x.count++; if (r.clientResponse === "ACCEPTED") x.accepted++;
  });
  const topClients = [...cl.values()].sort((a, b) => b.count - a.count).slice(0, 5);

  // Needs attention
  const attention = [
    ...open.filter((r) => r.status === "PLACED" && now - r.enquiryDate.getTime() > 3 * DAY).map((r) => ({ id: r.id, orderNumber: r.orderNumber, client: r.companyName || r.customerName, division: r.division.name, kind: "No price yet" as const, days: Math.floor((now - r.enquiryDate.getTime()) / DAY) })),
    ...open.filter((r) => r.status === "PRICED" && r.pricedAt && now - r.pricedAt.getTime() > 10 * DAY).map((r) => ({ id: r.id, orderNumber: r.orderNumber, client: r.companyName || r.customerName, division: r.division.name, kind: "Client silent" as const, days: Math.floor((now - r.pricedAt!.getTime()) / DAY) })),
  ].sort((a, b) => b.days - a.days).slice(0, 6);

  // Activity feed
  const events = await prisma.enquiryTimelineEvent.findMany({
    orderBy: { createdAt: "desc" }, take: 10,
    select: { id: true, title: true, detail: true, createdAt: true, actor: { select: { name: true } }, order: { select: { id: true, orderNumber: true, companyName: true, customerName: true, divisionId: true } } },
  });

  const sampleSent = cur.filter((r) => r.isSample && r.sampleSentAt);
  return NextResponse.json({
    days, comparedWith: { from: dayKey(prevStart), to: dayKey(new Date(start.getTime() - 1)) },
    current: c, previous: p, trend,
    funnel: [{ label: "Logged", value: c.logged }, { label: "Priced", value: c.priced }, { label: "Client replied", value: c.replied }, { label: "Accepted", value: c.accepted }],
    divisions, ageing, months, team, topClients, attention,
    openBook: { needsPricing: open.filter((r) => r.status === "PLACED").length, waiting: open.filter((r) => r.status === "PRICED").length },
    samples: { requested: c.samples, sent: sampleSent.length, avgDaysToSend: sampleSent.length ? r1(sampleSent.reduce((a, r) => a + (r.sampleSentAt!.getTime() - r.enquiryDate.getTime()) / DAY, 0) / sampleSent.length) : null },
    activity: events.map((e) => ({ id: e.id, title: e.title, detail: e.detail, at: e.createdAt, actor: e.actor?.name ?? "System", orderId: e.order.id, orderNumber: e.order.orderNumber, client: e.order.companyName || e.order.customerName })),
  });
}
