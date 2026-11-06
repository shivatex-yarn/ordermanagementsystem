"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Analytics } from "@/lib/analytics";

const C = { brand: "#4f46e5", act: "#eda100", wait: "#378add", done: "#1baf7a", late: "#e24b4a", grey: "#98a2b3", grid: "#eceef2", axis: "#667085" };
const STATUS_COLOR: Record<string, string> = { PLACED: C.act, PRICED: C.wait, CLOSED: C.done, CANCELLED: C.grey };
const RESP_COLOR: Record<string, string> = { ACCEPTED: C.done, NEGOTIATING: C.act, DECLINED: C.late };
const tip = { borderRadius: 12, border: "1px solid #e6e8ec", fontSize: 12, boxShadow: "none" } as const;

export function TrendChart({ data }: { data: Analytics["trend"] }) {
  return (
    <div className="h-64 px-2 pb-4 pt-2" role="img" aria-label="Enquiries logged and closed per day over the last 30 days">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ left: -18, right: 12, top: 8 }}>
          <defs>
            <linearGradient id="gl" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.brand} stopOpacity={0.25} /><stop offset="100%" stopColor={C.brand} stopOpacity={0} /></linearGradient>
          </defs>
          <CartesianGrid stroke={C.grid} vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.axis }} tickLine={false} axisLine={false} interval={4} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: C.axis }} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={tip} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
          <Area type="monotone" dataKey="logged" name="Logged" stroke={C.brand} strokeWidth={2} fill="url(#gl)" />
          <Area type="monotone" dataKey="closed" name="Closed" stroke={C.done} strokeWidth={2} fill="none" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function Donut({ data, colors, centre }: { data: { key: string; label: string; value: number }[]; colors: Record<string, string>; centre: string }) {
  const total = data.reduce((a, b) => a + b.value, 0);
  if (!total) return <p className="p-6 text-sm text-[var(--app-ink-3)]">No data yet.</p>;
  return (
    <div className="flex flex-wrap items-center gap-4 px-5 pb-5 pt-2">
      <div className="relative h-44 w-44 shrink-0" role="img" aria-label={data.map((d) => `${d.label} ${d.value}`).join(", ")}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="label" innerRadius={52} outerRadius={78} paddingAngle={2} stroke="none">
              {data.map((d) => <Cell key={d.key} fill={colors[d.key] ?? C.grey} />)}
            </Pie>
            <Tooltip contentStyle={tip} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="tnum text-2xl font-extrabold text-[var(--app-ink)]">{total}</span>
          <span className="text-[11px] text-[var(--app-ink-3)]">{centre}</span>
        </div>
      </div>
      <ul className="min-w-[8rem] flex-1 space-y-2 text-sm">
        {data.map((d) => (
          <li key={d.key} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-[var(--app-ink-2)]"><span className="h-2.5 w-2.5 rounded-full" style={{ background: colors[d.key] ?? C.grey }} />{d.label}</span>
            <span className="tnum font-semibold text-[var(--app-ink)]">{d.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export const StatusDonut = ({ data }: { data: Analytics["statusSplit"] }) => <Donut data={data} colors={STATUS_COLOR} centre="enquiries" />;
export const ResponseDonut = ({ data }: { data: Analytics["responseSplit"] }) => <Donut data={data} colors={RESP_COLOR} centre="responses" />;

export function DivisionBars({ data }: { data: Analytics["divisionBars"] }) {
  if (!data.length) return <p className="p-6 text-sm text-[var(--app-ink-3)]">No enquiries yet.</p>;
  return (
    <div className="px-2 pb-4 pt-2" style={{ height: Math.max(200, data.length * 44 + 60) }} role="img" aria-label="Enquiries per division by status">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
          <CartesianGrid stroke={C.grid} horizontal={false} />
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: C.axis }} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="name" width={92} tick={{ fontSize: 12, fill: C.axis }} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={tip} cursor={{ fill: "#f6f7f9" }} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="PLACED" name="Needs pricing" stackId="a" fill={C.act} />
          <Bar dataKey="PRICED" name="Waiting for client" stackId="a" fill={C.wait} />
          <Bar dataKey="CLOSED" name="Closed" stackId="a" fill={C.done} radius={[0, 6, 6, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function KpiStrip({ k }: { k: Analytics["kpis"] }) {
  const items = [
    { label: "Logged this month", value: String(k.loggedThisMonth) },
    { label: "Avg time to price", value: k.avgHoursToPrice === null ? "—" : k.avgHoursToPrice >= 48 ? `${Math.round(k.avgHoursToPrice / 24)} days` : `${k.avgHoursToPrice} hrs` },
    { label: "Client acceptance", value: k.acceptRate === null ? "—" : `${k.acceptRate}%` },
    { label: "Sample requests", value: k.sampleShare === null ? "—" : `${k.sampleShare}%` },
  ];
  return (
    <dl className="grid grid-cols-2 divide-x divide-y divide-[var(--app-line-soft)] sm:grid-cols-4 sm:divide-y-0">
      {items.map((i) => (
        <div key={i.label} className="px-5 py-4">
          <dt className="text-xs font-semibold text-[var(--app-ink-3)]">{i.label}</dt>
          <dd className="tnum mt-1 text-2xl font-extrabold tracking-tight text-[var(--app-ink)]">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}
