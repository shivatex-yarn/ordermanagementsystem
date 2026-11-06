import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

const TZ = "Asia/Kolkata";
const dayKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ });

export type CalendarEvent = { id: number; orderNumber: string; name: string; kind: "enquiry" | "sample" | "feedback" };
export type Analytics = {
  trend: { date: string; label: string; logged: number; closed: number }[];
  statusSplit: { key: string; label: string; value: number }[];
  responseSplit: { key: string; label: string; value: number }[];
  divisionBars: { name: string; PLACED: number; PRICED: number; CLOSED: number }[];
  sampleSplit: { sample: number; full: number };
  kpis: { total180: number; avgHoursToPrice: number | null; acceptRate: number | null; sampleShare: number | null; loggedThisMonth: number };
  calendar: Record<string, CalendarEvent[]>;
  funnel: { label: string; value: number }[];
  topClients: { name: string; count: number; lastDate: string }[];
  team: { name: string; role: "MARKETING" | "SALES"; count: number }[];
  oldestWaiting: { orderNumber: string; id: number; name: string; days: number } | null;
  days: number;
};
export type AnalyticsOptions = { days?: number; divisionId?: number; from?: string; to?: string };

/** Everything the dashboard charts need, from the last 180 days of enquiries inside `scope`. */
export async function computeAnalytics(scope: Prisma.OrderWhereInput, opts: AnalyticsOptions = {}): Promise<Analytics> {
  const okDate = (v?: string) => (v && !Number.isNaN(new Date(v).getTime()) ? v : undefined);
  const from = okDate(opts.from);
  const to = okDate(opts.to);
  const presetDays = [7, 30, 90, 180, 365].includes(opts.days ?? 0) ? (opts.days as number) : 30;
  const end = to ? new Date(`${to}T23:59:59.999+05:30`) : new Date();
  const start = from ? new Date(`${from}T00:00:00+05:30`) : new Date(end.getTime() - presetDays * 864e5);
  const days0 = Math.max(1, Math.round((end.getTime() - start.getTime()) / 864e5));
  const windowStart = start;
  const fetchSince = new Date(Math.min(start.getTime(), Date.now() - 120 * 864e5));
  const fullRows = await prisma.order.findMany({
    where: { ...scope, ...(opts.divisionId ? { divisionId: opts.divisionId } : {}), enquiryDate: { gte: fetchSince } },
    orderBy: { enquiryDate: "desc" },
    take: 3000,
    select: {
      id: true, orderNumber: true, status: true, enquiryDate: true, createdAt: true, customerName: true, companyName: true,
      isSample: true, sampleSentAt: true, pricedAt: true, closedAt: true, clientResponse: true, clientFeedbackAt: true,
      division: { select: { name: true } },
      createdBy: { select: { name: true } },
      pricedBy: { select: { name: true } },
    },
  });
  const rows = fullRows.filter((r) => r.enquiryDate >= windowStart && r.enquiryDate <= end);

  // 30-day trend
  const days: { date: string; label: string; logged: number; closed: number }[] = [];
  const points = Math.min(days0 + 1, 120);
  for (let i = points - 1; i >= 0; i--) {
    const d = new Date(end.getTime() - i * 864e5);
    days.push({ date: dayKey(d), label: d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: TZ }), logged: 0, closed: 0 });
  }
  const idx = new Map(days.map((d, i) => [d.date, i]));
  const statusCount: Record<string, number> = {};
  const respCount: Record<string, number> = {};
  const perDiv = new Map<string, { PLACED: number; PRICED: number; CLOSED: number }>();
  const calendar: Record<string, CalendarEvent[]> = {};
  const addCal = (d: Date | null, ev: CalendarEvent) => {
    if (!d) return;
    (calendar[dayKey(d)] ??= []).push(ev);
  };
  let sample = 0, priced = 0, priceMs = 0, loggedThisMonth = 0;
  const monthKey = dayKey(new Date()).slice(0, 7);

  for (const r of rows) {
    const name = r.companyName || r.customerName;
    statusCount[r.status] = (statusCount[r.status] ?? 0) + 1;
    if (r.clientResponse) respCount[r.clientResponse] = (respCount[r.clientResponse] ?? 0) + 1;
    if (r.isSample) sample++;
    if (r.pricedAt) { priced++; priceMs += r.pricedAt.getTime() - r.createdAt.getTime(); }
    const ek = dayKey(r.enquiryDate);
    if (ek.startsWith(monthKey)) loggedThisMonth++;
    const i = idx.get(ek);
    if (i !== undefined) days[i].logged++;
    if (r.closedAt) { const j = idx.get(dayKey(r.closedAt)); if (j !== undefined) days[j].closed++; }
    if (r.status !== "CANCELLED") {
      const d = perDiv.get(r.division.name) ?? { PLACED: 0, PRICED: 0, CLOSED: 0 };
      d[r.status as "PLACED" | "PRICED" | "CLOSED"]++;
      perDiv.set(r.division.name, d);
    }
  }
  for (const r of fullRows) {
    const name = r.companyName || r.customerName;
    addCal(r.enquiryDate, { id: r.id, orderNumber: r.orderNumber, name, kind: "enquiry" });
    addCal(r.sampleSentAt, { id: r.id, orderNumber: r.orderNumber, name, kind: "sample" });
    addCal(r.clientFeedbackAt, { id: r.id, orderNumber: r.orderNumber, name, kind: "feedback" });
  }
  // funnel, top clients, team activity, oldest waiting
  const funnel = [
    { label: "Logged", value: rows.length },
    { label: "Priced", value: rows.filter((r) => r.pricedAt).length },
    { label: "Client replied", value: rows.filter((r) => r.clientResponse).length },
    { label: "Accepted", value: rows.filter((r) => r.clientResponse === "ACCEPTED").length },
  ];
  const clients = new Map<string, { name: string; count: number; last: Date }>();
  const team = new Map<string, { name: string; role: "MARKETING" | "SALES"; count: number }>();
  for (const r of rows) {
    const nm = (r.companyName || r.customerName).trim();
    const k = nm.toLowerCase();
    const c = clients.get(k);
    clients.set(k, { name: c?.name ?? nm, count: (c?.count ?? 0) + 1, last: c && c.last > r.enquiryDate ? c.last : r.enquiryDate });
    const m = team.get("M" + r.createdBy.name) ?? { name: r.createdBy.name, role: "MARKETING" as const, count: 0 };
    m.count++;
    team.set("M" + r.createdBy.name, m);
    if (r.pricedBy) {
      const sv = team.get("S" + r.pricedBy.name) ?? { name: r.pricedBy.name, role: "SALES" as const, count: 0 };
      sv.count++;
      team.set("S" + r.pricedBy.name, sv);
    }
  }
  const topClients = [...clients.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((c) => ({ name: c.name, count: c.count, lastDate: dayKey(c.last) }));
  const waiting = fullRows.filter((r) => r.status === "PLACED").sort((a, b) => a.enquiryDate.getTime() - b.enquiryDate.getTime())[0];
  const oldestWaiting = waiting ? { id: waiting.id, orderNumber: waiting.orderNumber, name: waiting.companyName || waiting.customerName, days: Math.max(0, Math.floor((Date.now() - waiting.enquiryDate.getTime()) / 864e5)) } : null;

  const accepted = respCount.ACCEPTED ?? 0, declined = respCount.DECLINED ?? 0;
  const label = { PLACED: "Needs pricing", PRICED: "Waiting for client", CLOSED: "Closed", CANCELLED: "Cancelled" } as Record<string, string>;
  const rlabel = { ACCEPTED: "Accepted", NEGOTIATING: "Negotiating", DECLINED: "Declined" } as Record<string, string>;
  return {
    trend: days,
    statusSplit: Object.entries(statusCount).map(([key, value]) => ({ key, label: label[key] ?? key, value })),
    responseSplit: Object.entries(respCount).map(([key, value]) => ({ key, label: rlabel[key] ?? key, value })),
    divisionBars: [...perDiv.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.PLACED + b.PRICED + b.CLOSED - (a.PLACED + a.PRICED + a.CLOSED)),
    sampleSplit: { sample, full: rows.length - sample },
    kpis: {
      total180: rows.length,
      avgHoursToPrice: priced ? Math.round((priceMs / priced / 36e5) * 10) / 10 : null,
      acceptRate: accepted + declined ? Math.round((accepted / (accepted + declined)) * 100) : null,
      sampleShare: rows.length ? Math.round((sample / rows.length) * 100) : null,
      loggedThisMonth,
    },
    calendar,
    funnel,
    topClients,
    team: [...team.values()].sort((a, b) => b.count - a.count).slice(0, 8),
    oldestWaiting,
    days: days0,
  };
}
