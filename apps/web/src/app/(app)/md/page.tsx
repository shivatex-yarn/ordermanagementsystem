"use client";

import { useState } from "react";
import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Area, AreaChart, Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, BarChart } from "recharts";
import { ArrowDownRight, ArrowRight, ArrowUpRight, FlaskConical, Siren, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { api, fmtDateTime } from "@/lib/format";
import { PanelSkeleton } from "@/components/ui/panel";
import { cn } from "@/lib/utils";

type Stats = { logged: number; priced: number; accepted: number; declined: number; replied: number; acceptRate: number | null; hoursToPrice: number | null; daysToClose: number | null; samples: number };
type Data = {
  days: number; comparedWith: { from: string; to: string }; current: Stats; previous: Stats;
  trend: { label: string; logged: number; priced: number; accepted: number }[];
  funnel: { label: string; value: number }[];
  divisions: { name: string; logged: number; accepted: number; open: number; acceptRate: number | null; hoursToPrice: number | null }[];
  ageing: { label: string; needsPricing: number; waiting: number }[];
  months: { label: string; logged: number; accepted: number }[];
  team: { name: string; role: "MARKETING" | "SALES"; count: number; hours: number | null }[];
  topClients: { name: string; count: number; accepted: number }[];
  attention: { id: number; orderNumber: string; client: string; division: string; kind: "No price yet" | "Client silent"; days: number }[];
  openBook: { needsPricing: number; waiting: number };
  samples: { requested: number; sent: number; avgDaysToSend: number | null };
  activity: { id: number; title: string; detail: string | null; at: string; actor: string; orderId: number; orderNumber: string; client: string }[];
};

const P = { indigo: "#818cf8", green: "#34d399", amber: "#fbbf24", rose: "#fb7185", sky: "#38bdf8", grid: "rgba(255,255,255,0.07)", axis: "#9aa0c7" };
const tip = { background: "#17153d", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, fontSize: 12, color: "#fff" } as const;
const card = "rounded-2xl border border-white/10 bg-white/[0.045] backdrop-blur";
const PERIODS = [{ d: 7, l: "7D" }, { d: 30, l: "30D" }, { d: 90, l: "90D" }, { d: 365, l: "1Y" }];

function Delta({ cur, prev, lowerIsBetter }: { cur: number | null; prev: number | null; lowerIsBetter?: boolean }) {
  if (cur === null || prev === null || prev === 0) return <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-indigo-200">{cur === null ? "—" : "new"}</span>;
  const pct = Math.round(((cur - prev) / prev) * 100);
  if (pct === 0) return <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-indigo-200">no change</span>;
  const good = lowerIsBetter ? pct < 0 : pct > 0;
  const Icon = pct > 0 ? ArrowUpRight : ArrowDownRight;
  return <span className={cn("inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-bold", good ? "bg-emerald-400/15 text-emerald-300" : "bg-rose-400/15 text-rose-300")}><Icon className="h-3 w-3" aria-hidden />{Math.abs(pct)}%</span>;
}

function Kpi({ label, value, unit, cur, prev, lowerIsBetter, spark, color }: { label: string; value: string; unit?: string; cur: number | null; prev: number | null; lowerIsBetter?: boolean; spark?: { v: number }[]; color: string }) {
  return (
    <div className={cn(card, "relative overflow-hidden p-5")}>
      <div className="flex items-start justify-between gap-2"><p className="text-xs font-semibold uppercase tracking-wider text-indigo-200/80">{label}</p><Delta cur={cur} prev={prev} lowerIsBetter={lowerIsBetter} /></div>
      <p className="tnum mt-3 text-4xl font-extrabold tracking-tight">{value}{unit ? <span className="ml-1 text-base font-semibold text-indigo-200/70">{unit}</span> : null}</p>
      {spark ? (
        <div className="-mx-5 -mb-5 mt-3 h-14" aria-hidden>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={spark} margin={{ top: 4, bottom: 0, left: 0, right: 0 }}>
              <defs><linearGradient id={`sp-${label}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.35} /><stop offset="100%" stopColor={color} stopOpacity={0} /></linearGradient></defs>
              <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={`url(#sp-${label})`} dot={false} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : null}
    </div>
  );
}

function Gauge({ pct }: { pct: number | null }) {
  const r = 52, c = Math.PI * r, v = pct ?? 0;
  return (
    <div className="relative mx-auto w-56" role="img" aria-label={pct === null ? "No decided quotes yet" : `Win rate ${pct}%`}>
      <svg viewBox="0 0 140 84" className="w-full">
        <path d="M 18 70 A 52 52 0 0 1 122 70" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="11" strokeLinecap="round" />
        <path d="M 18 70 A 52 52 0 0 1 122 70" fill="none" stroke="url(#gauge)" strokeWidth="11" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (c * v) / 100} />
        <defs><linearGradient id="gauge" x1="0" x2="1"><stop offset="0%" stopColor="#818cf8" /><stop offset="100%" stopColor="#34d399" /></linearGradient></defs>
      </svg>
      <div className="absolute inset-x-0 bottom-1 text-center"><p className="tnum text-4xl font-extrabold">{pct === null ? "—" : `${pct}%`}</p><p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-200/70">win rate</p></div>
    </div>
  );
}

const H = ({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) => (
  <div className="mb-4 flex items-start justify-between gap-3"><div><h2 className="text-sm font-bold tracking-tight">{title}</h2>{sub ? <p className="mt-0.5 text-xs text-indigo-200/60">{sub}</p> : null}</div>{right}</div>
);

export default function MdDashboard() {
  const { user } = useAuth();
  const [days, setDays] = useState(30);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [division, setDivision] = useState("");
  const qs = new URLSearchParams({ days: String(days) });
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  if (division) qs.set("divisionId", division);
  const { data, isLoading } = useQuery({ queryKey: ["md", days, from, to, division], queryFn: () => api<Data>(`/api/md?${qs}`), placeholderData: keepPreviousData, staleTime: 30_000 });
  if (isLoading || !data) return <PanelSkeleton className="h-[48rem] !bg-[#0c0b26]" />;

  const c = data.current, p = data.previous;
  const custom = !!(from || to);
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const sp = (k: "logged" | "priced" | "accepted") => data.trend.map((t) => ({ v: t[k] }));
  const top = Math.max(1, data.funnel[0]?.value ?? 1);
  const maxDiv = Math.max(1, ...data.divisions.map((d) => d.logged));
  const maxTeam = Math.max(1, ...data.team.map((t) => t.count));

  return (
    <div className="rounded-[28px] bg-[#0c0b26] p-5 text-white ring-1 ring-white/10 sm:p-8" style={{ backgroundImage: "radial-gradient(60rem 28rem at 85% -10%, rgba(99,102,241,0.28), transparent 60%), radial-gradient(40rem 24rem at -10% 110%, rgba(52,211,153,0.10), transparent 60%)" }}>
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-300/80">Executive overview</p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">{greet}, {user?.name.split(" ")[0]}</h1>
          <p className="mt-1.5 text-sm text-indigo-200/70">{custom ? "Your date range" : `Last ${data.days} days`} compared with the {data.days} days before it.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="radiogroup" aria-label="Period" className="inline-flex rounded-xl border border-white/10 bg-white/[0.05] p-1">
            {PERIODS.map((x) => (
              <button key={x.d} role="radio" aria-checked={!custom && days === x.d} onClick={() => { setFrom(""); setTo(""); setDays(x.d); }}
                className={cn("rounded-lg px-3 py-1.5 text-xs font-bold transition-colors", !custom && days === x.d ? "bg-indigo-500 text-white" : "text-indigo-200/70 hover:text-white")}>{x.l}</button>
            ))}
          </div>
          <div className={cn("flex items-center gap-1 rounded-xl border bg-white/[0.05] px-2 py-1", custom ? "border-indigo-400" : "border-white/10")}>
            <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} aria-label="From date" className="h-8 rounded-lg bg-transparent px-1 text-xs text-white [color-scheme:dark] focus:outline-none" />
            <span className="text-indigo-300/60">→</span>
            <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-label="To date" className="h-8 rounded-lg bg-transparent px-1 text-xs text-white [color-scheme:dark] focus:outline-none" />
            {custom ? <button onClick={() => { setFrom(""); setTo(""); }} aria-label="Clear dates" className="rounded p-1 text-indigo-200 hover:bg-white/10"><X className="h-3.5 w-3.5" /></button> : null}
          </div>
          {(user?.divisions.length ?? 0) > 1 ? (
            <select aria-label="Division" value={division} onChange={(e) => setDivision(e.target.value)} className="h-10 rounded-xl border border-white/10 bg-[#17153d] px-3 text-xs font-semibold text-white focus:outline-none">
              <option value="">All divisions</option>
              {user?.divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          ) : null}
        </div>
      </div>

      {/* KPIs */}
      <div className="mt-7 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Enquiries" value={String(c.logged)} cur={c.logged} prev={p.logged} spark={sp("logged")} color={P.indigo} />
        <Kpi label="Quotes priced" value={String(c.priced)} cur={c.priced} prev={p.priced} spark={sp("priced")} color={P.sky} />
        <Kpi label="Deals won" value={String(c.accepted)} cur={c.accepted} prev={p.accepted} spark={sp("accepted")} color={P.green} />
        <Kpi label="Time to price" value={c.hoursToPrice === null ? "—" : c.hoursToPrice >= 48 ? String(Math.round(c.hoursToPrice / 24)) : String(c.hoursToPrice)} unit={c.hoursToPrice === null ? undefined : c.hoursToPrice >= 48 ? "days" : "hrs"} cur={c.hoursToPrice} prev={p.hoursToPrice} lowerIsBetter color={P.amber} />
      </div>

      {/* Trend + win rate + funnel */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <section className={cn(card, "p-5 lg:col-span-2")}>
          <H title="Pipeline activity" sub="Enquiries logged, quotes priced and deals won per day" />
          <div className="h-72" role="img" aria-label="Daily enquiries, quotes and deals">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.trend} margin={{ left: -18, right: 8, top: 6 }}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={P.indigo} stopOpacity={0.4} /><stop offset="100%" stopColor={P.indigo} stopOpacity={0} /></linearGradient>
                  <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={P.green} stopOpacity={0.3} /><stop offset="100%" stopColor={P.green} stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid stroke={P.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: P.axis }} tickLine={false} axisLine={false} minTickGap={36} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: P.axis }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tip} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12, color: P.axis }} />
                <Area type="monotone" dataKey="logged" name="Logged" stroke={P.indigo} strokeWidth={2.2} fill="url(#g1)" />
                <Area type="monotone" dataKey="priced" name="Priced" stroke={P.sky} strokeWidth={2} fill="none" />
                <Area type="monotone" dataKey="accepted" name="Won" stroke={P.green} strokeWidth={2.2} fill="url(#g2)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className={cn(card, "p-5")}>
          <H title="Conversion" sub="Win rate and where enquiries drop off" />
          <Gauge pct={c.acceptRate} />
          <ul className="mt-5 space-y-3">
            {data.funnel.map((s, i) => {
              const prev = i ? data.funnel[i - 1].value : null;
              return (
                <li key={s.label}>
                  <div className="mb-1 flex items-baseline justify-between text-xs"><span className="font-semibold text-indigo-100">{s.label}</span><span className="tnum text-indigo-200/80">{s.value}{prev ? <span className="ml-1.5 text-indigo-300/50">{Math.round((s.value / prev) * 100)}%</span> : null}</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full" style={{ width: `${(s.value / top) * 100}%`, background: `linear-gradient(90deg, ${P.indigo}, ${P.green})`, opacity: 1 - i * 0.16 }} /></div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      {/* Divisions + ageing */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <section className={cn(card, "p-5 lg:col-span-2")}>
          <H title="Division leaderboard" sub="Volume, win rate and pricing speed" />
          {data.divisions.length === 0 ? <p className="py-8 text-center text-sm text-indigo-200/60">No enquiries in this period.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead><tr className="text-left text-[10px] font-bold uppercase tracking-wider text-indigo-300/60"><th className="pb-2 pr-3">Division</th><th className="pb-2 pr-3">Enquiries</th><th className="pb-2 pr-3 text-center">Won</th><th className="pb-2 pr-3 text-center">Win rate</th><th className="pb-2 pr-3 text-center">Open</th><th className="pb-2 text-right">Time to price</th></tr></thead>
                <tbody>
                  {data.divisions.map((d, i) => (
                    <tr key={d.name} className="border-t border-white/[0.07]">
                      <td className="py-3 pr-3"><span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-md bg-indigo-400/20 text-[10px] font-bold text-indigo-200">{i + 1}</span><span className="font-semibold">{d.name}</span></td>
                      <td className="py-3 pr-3"><div className="flex items-center gap-2"><div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-indigo-400" style={{ width: `${(d.logged / maxDiv) * 100}%` }} /></div><span className="tnum text-xs text-indigo-100">{d.logged}</span></div></td>
                      <td className="tnum py-3 pr-3 text-center text-emerald-300">{d.accepted}</td>
                      <td className="tnum py-3 pr-3 text-center">{d.acceptRate === null ? "—" : `${d.acceptRate}%`}</td>
                      <td className="tnum py-3 pr-3 text-center text-amber-300">{d.open}</td>
                      <td className="tnum py-3 text-right text-indigo-100">{d.hoursToPrice === null ? "—" : d.hoursToPrice >= 48 ? `${Math.round(d.hoursToPrice / 24)} d` : `${d.hoursToPrice} h`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <section className={cn(card, "p-5")}>
          <H title="Open book by age" sub={`${data.openBook.needsPricing} need pricing · ${data.openBook.waiting} waiting on clients`} />
          <div className="h-60" role="img" aria-label="Open enquiries by age">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.ageing} margin={{ left: -22, right: 4, top: 6 }}>
                <CartesianGrid stroke={P.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: P.axis }} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: P.axis }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tip} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                <Bar dataKey="needsPricing" name="Needs pricing" stackId="a" fill={P.amber} />
                <Bar dataKey="waiting" name="Waiting for client" stackId="a" fill={P.sky} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      {/* Six months + team */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className={cn(card, "p-5")}>
          <H title="Six-month view" sub="Enquiries against deals won, by month" />
          <div className="h-64" role="img" aria-label="Monthly enquiries and deals won">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data.months} margin={{ left: -22, right: 8, top: 6 }}>
                <CartesianGrid stroke={P.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: P.axis }} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: P.axis }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tip} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12, color: P.axis }} />
                <Bar dataKey="logged" name="Enquiries" fill={P.indigo} radius={[6, 6, 0, 0]} barSize={26} />
                <Line type="monotone" dataKey="accepted" name="Won" stroke={P.green} strokeWidth={2.5} dot={{ r: 3.5, fill: P.green }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className={cn(card, "p-5")}>
          <H title="Team performance" sub="Enquiries logged by Marketing, quotes priced by Sales" />
          {data.team.length === 0 ? <p className="py-8 text-center text-sm text-indigo-200/60">No activity in this period.</p> : (
            <ul className="space-y-3.5">
              {data.team.map((t) => (
                <li key={t.role + t.name}>
                  <div className="mb-1 flex items-center justify-between text-sm"><span className="font-semibold">{t.name}<span className={cn("ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold", t.role === "MARKETING" ? "bg-indigo-400/20 text-indigo-200" : "bg-emerald-400/15 text-emerald-300")}>{t.role === "MARKETING" ? "logged" : "priced"}</span></span><span className="tnum text-xs text-indigo-100">{t.count}{t.hours !== null ? <span className="ml-2 text-indigo-300/60">avg {t.hours >= 48 ? `${Math.round(t.hours / 24)}d` : `${t.hours}h`}</span> : null}</span></div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className={cn("h-full rounded-full", t.role === "MARKETING" ? "bg-indigo-400" : "bg-emerald-400")} style={{ width: `${(t.count / maxTeam) * 100}%` }} /></div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Attention, clients, activity */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <section className={cn(card, "p-5")}>
          <H title="Needs your attention" sub="Stuck for too long" right={<Siren className="h-4 w-4 text-rose-300" aria-hidden />} />
          {data.attention.length === 0 ? <p className="py-6 text-sm text-emerald-300">Nothing is stuck. All moving.</p> : (
            <ul className="space-y-2.5">
              {data.attention.map((a) => (
                <li key={`${a.id}-${a.kind}`}>
                  <Link href={`/orders/${a.id}`} className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 transition-colors hover:bg-white/[0.08]">
                    <span className={cn("shrink-0 rounded-lg px-2 py-1 text-[10px] font-bold", a.kind === "No price yet" ? "bg-amber-400/15 text-amber-300" : "bg-sky-400/15 text-sky-300")}>{a.days}d</span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{a.orderNumber} · {a.client}</span><span className="block text-[11px] text-indigo-300/60">{a.kind} · {a.division}</span></span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-indigo-300/50" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className={cn(card, "p-5")}>
          <H title="Top clients" sub="By enquiries in the period" />
          {data.topClients.length === 0 ? <p className="py-6 text-sm text-indigo-200/60">No clients yet.</p> : (
            <ul className="space-y-3">
              {data.topClients.map((cl, i) => (
                <li key={cl.name} className="flex items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-400/20 text-xs font-bold text-indigo-200">{i + 1}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{cl.name}</span><span className="text-[11px] text-indigo-300/60">{cl.accepted} won</span></span>
                  <span className="tnum text-sm font-bold">{cl.count}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-5 flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
            <FlaskConical className="h-5 w-5 shrink-0 text-indigo-300" aria-hidden />
            <p className="text-xs text-indigo-100"><b className="tnum">{data.samples.requested}</b> sample requests, <b className="tnum">{data.samples.sent}</b> sent{data.samples.avgDaysToSend !== null ? <>, <b className="tnum">{data.samples.avgDaysToSend}</b> days on average to send</> : null}.</p>
          </div>
        </section>
        <section className={cn(card, "p-5")}>
          <H title="Live activity" sub="Latest across all divisions" />
          <ol className="relative space-y-4 border-l border-white/10 pl-4">
            {data.activity.map((a) => (
              <li key={a.id} className="relative">
                <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-indigo-400 ring-4 ring-[#0c0b26]" />
                <p className="text-sm font-semibold leading-snug">{a.title}</p>
                <p className="text-xs text-indigo-200/70"><Link href={`/orders/${a.orderId}`} className="font-bold text-indigo-300 hover:underline">{a.orderNumber}</Link> · {a.client}</p>
                <p className="text-[11px] text-indigo-300/50">{a.actor} · {fmtDateTime(a.at)}</p>
              </li>
            ))}
            {data.activity.length === 0 ? <li className="text-sm text-indigo-200/60">No activity yet.</li> : null}
          </ol>
        </section>
      </div>
    </div>
  );
}
