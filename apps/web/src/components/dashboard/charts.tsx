"use client";

import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_AXIS, CHART_GRID, SERIES, STATUS_COLOR } from "@/lib/chart-palette";

const AXIS_TICK = { fontSize: 11, fill: CHART_AXIS, fontWeight: 500 };

function TooltipCard({ title, rows }: { title: string; rows: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="rounded-xl border border-[var(--app-line)] bg-white px-3 py-2 shadow-lg">
      <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--app-ink-3)]">{title}</p>
      <div className="mt-1.5 space-y-1">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-2 text-xs">
            {r.color ? (
              <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: r.color }} aria-hidden />
            ) : null}
            <span className="text-[var(--app-ink-2)]">{r.label}</span>
            <span className="tnum ml-auto font-bold text-[var(--app-ink)]">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Shared legend — present whenever a chart draws more than one series. */
export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5 text-xs font-medium text-[var(--app-ink-2)]">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: i.color }} aria-hidden />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

export type MonthPoint = { month: string; year: number; submitted: number; completed: number };

/** Enquiries submitted against enquiries completed, month by month. */
export function VolumeChart({ data }: { data: MonthPoint[] }) {
  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -18 }} barGap={2}>
          <CartesianGrid vertical={false} stroke={CHART_GRID} />
          <XAxis dataKey="month" tickLine={false} axisLine={false} tick={AXIS_TICK} dy={6} />
          <YAxis tickLine={false} axisLine={false} tick={AXIS_TICK} allowDecimals={false} width={44} />
          <Tooltip
            cursor={{ fill: "rgba(79,70,229,0.06)" }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <TooltipCard
                  title={`${label} ${payload[0]?.payload?.year ?? ""}`}
                  rows={[
                    { label: "Submitted", value: String(payload[0]?.payload?.submitted ?? 0), color: SERIES.primary },
                    { label: "Completed", value: String(payload[0]?.payload?.completed ?? 0), color: SERIES.secondary },
                  ]}
                />
              ) : null
            }
          />
          <Bar dataKey="submitted" fill={SERIES.primary} radius={[4, 4, 0, 0]} maxBarSize={14} />
          <Bar dataKey="completed" fill={SERIES.secondary} radius={[4, 4, 0, 0]} maxBarSize={14} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export type StatusPoint = { key: string; label: string; count: number };

/** Where the open book sits right now. Values are printed beside the legend. */
export function StatusDonut({ data }: { data: StatusPoint[] }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  if (total === 0) {
    return (
      <p className="py-10 text-center text-sm text-[var(--app-ink-3)]">No enquiries to chart yet.</p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="relative h-[180px] w-[180px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="count"
              nameKey="label"
              innerRadius={58}
              outerRadius={86}
              paddingAngle={2}
              stroke="#ffffff"
              strokeWidth={2}
            >
              {data.map((d) => (
                <Cell key={d.key} fill={STATUS_COLOR[d.key] ?? SERIES.primary} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <TooltipCard
                    title={String(payload[0]?.name ?? "")}
                    rows={[
                      {
                        label: "Enquiries",
                        value: `${payload[0]?.value} of ${total}`,
                        color: STATUS_COLOR[String(payload[0]?.payload?.key)] ?? SERIES.primary,
                      },
                    ]}
                  />
                ) : null
              }
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-extrabold leading-none text-[var(--app-ink)]">{total}</span>
          <span className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--app-ink-3)]">
            Enquiries
          </span>
        </div>
      </div>

      <ul className="min-w-[180px] flex-1 space-y-2">
        {data.map((d) => (
          <li key={d.key} className="flex items-center gap-2.5 text-sm">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ background: STATUS_COLOR[d.key] ?? SERIES.primary }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate text-[var(--app-ink-2)]">{d.label}</span>
            <span className="tnum font-bold text-[var(--app-ink)]">{d.count}</span>
            <span className="tnum w-10 text-right text-xs text-[var(--app-ink-3)]">
              {Math.round((d.count / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export type CityPoint = { name: string; count: number };

/** Horizontal bars — one series, so every bar carries its own value label. */
export function CityBars({ data }: { data: CityPoint[] }) {
  if (data.length === 0) {
    return <p className="py-10 text-center text-sm text-[var(--app-ink-3)]">No customer addresses recorded yet.</p>;
  }
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <ul className="space-y-3">
      {data.map((d) => (
        <li key={d.name}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-sm font-medium text-[var(--app-ink-2)]">{d.name}</span>
            <span className="tnum shrink-0 text-sm font-bold text-[var(--app-ink)]">{d.count}</span>
          </div>
          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-[var(--app-line-soft)]">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.max(4, (d.count / max) * 100)}%`, background: SERIES.primary }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export type DivisionPoint = { name: string; count: number };

/** Load per division — single series, direct labels on the axis. */
export function DivisionBars({ data }: { data: DivisionPoint[] }) {
  if (data.length === 0) {
    return <p className="py-10 text-center text-sm text-[var(--app-ink-3)]">No divisions have enquiries yet.</p>;
  }
  return (
    <div style={{ height: Math.max(160, data.length * 44) }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 28, bottom: 0, left: 0 }}>
          <CartesianGrid horizontal={false} stroke={CHART_GRID} />
          <XAxis type="number" hide allowDecimals={false} />
          <YAxis
            type="category"
            dataKey="name"
            tickLine={false}
            axisLine={false}
            tick={AXIS_TICK}
            width={120}
          />
          <Tooltip
            cursor={{ fill: "rgba(79,70,229,0.06)" }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <TooltipCard
                  title={String(label)}
                  rows={[{ label: "Enquiries", value: String(payload[0]?.value ?? 0), color: SERIES.primary }]}
                />
              ) : null
            }
          />
          <Bar dataKey="count" fill={SERIES.primary} radius={[0, 4, 4, 0]} maxBarSize={16} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
