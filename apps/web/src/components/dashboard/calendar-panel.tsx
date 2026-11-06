"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { CalendarEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const KIND = {
  enquiry: { label: "Enquiry logged", dot: "bg-[var(--app-brand)]" },
  sample: { label: "Sample sent", dot: "bg-[var(--app-act-ink)]" },
  feedback: { label: "Client feedback", dot: "bg-[var(--app-done-ink)]" },
} as const;
const key = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Month grid. A dot marks each kind of activity on a day; click a day to list it. */
export function CalendarPanel({ data }: { data: Record<string, CalendarEvent[]> }) {
  const today = useMemo(() => new Date(), []);
  const todayKey = key(today.getFullYear(), today.getMonth(), today.getDate());
  const [offset, setOffset] = useState(0);
  const [picked, setPicked] = useState<string>(todayKey);

  const view = new Date(today.getFullYear(), today.getMonth() + offset, 1);
  const year = view.getFullYear(), month = view.getMonth();
  const lead = (new Date(year, month, 1).getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const events = data[picked] ?? [];

  return (
    <div className="px-5 pb-5">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-bold text-[var(--app-ink)]">{MONTHS[month]} {year}</p>
        <div className="flex gap-1">
          <button aria-label="Previous month" onClick={() => setOffset((o) => o - 1)} className="rounded-lg border border-[var(--app-line)] p-1.5 hover:bg-[var(--app-surface-sunk)]"><ChevronLeft className="h-4 w-4" /></button>
          <button aria-label="Next month" onClick={() => setOffset((o) => o + 1)} className="rounded-lg border border-[var(--app-line)] p-1.5 hover:bg-[var(--app-surface-sunk)]"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-[var(--app-ink-3)]">{WEEKDAYS.map((w) => <span key={w}>{w}</span>)}</div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (d === null) return <span key={`e${i}`} />;
          const k = key(year, month, d);
          const ev = data[k] ?? [];
          const kinds = [...new Set(ev.map((e) => e.kind))];
          return (
            <button key={k} onClick={() => setPicked(k)} aria-label={`${d} ${MONTHS[month]}, ${ev.length} events`} aria-pressed={picked === k}
              className={cn("flex h-11 flex-col items-center justify-center rounded-lg text-sm transition-colors", picked === k ? "bg-[var(--app-brand)] text-white" : k === todayKey ? "bg-[var(--app-brand-tint)] font-bold text-[var(--app-brand)]" : "text-[var(--app-ink-2)] hover:bg-[var(--app-surface-sunk)]")}>
              <span className="tnum">{d}</span>
              <span className="mt-0.5 flex h-1.5 gap-0.5">{kinds.map((kd) => <span key={kd} className={cn("h-1.5 w-1.5 rounded-full", picked === k ? "bg-white" : KIND[kd].dot)} />)}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--app-ink-3)]">
        {Object.values(KIND).map((k) => <span key={k.label} className="inline-flex items-center gap-1.5"><span className={cn("h-2 w-2 rounded-full", k.dot)} />{k.label}</span>)}
      </div>
      <div className="mt-4 border-t border-[var(--app-line-soft)] pt-3">
        <p className="mb-2 text-xs font-bold text-[var(--app-ink-2)]">{picked === todayKey ? "Today" : picked}</p>
        {events.length === 0 ? <p className="text-sm text-[var(--app-ink-3)]">Nothing on this day.</p> : (
          <ul className="space-y-2">
            {events.slice(0, 8).map((e, i) => (
              <li key={`${e.id}-${e.kind}-${i}`} className="flex items-center gap-2 text-sm">
                <span className={cn("h-2 w-2 shrink-0 rounded-full", KIND[e.kind].dot)} />
                <Link href={`/orders/${e.id}`} className="whitespace-nowrap font-bold text-[var(--app-brand)] hover:underline">{e.orderNumber}</Link>
                <span className="min-w-0 flex-1 truncate text-[var(--app-ink-2)]">{e.name}</span>
                <span className="shrink-0 text-[11px] text-[var(--app-ink-3)]">{KIND[e.kind].label}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
