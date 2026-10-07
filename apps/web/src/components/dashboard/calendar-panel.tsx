"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export type CalendarMap = Record<string, { due: number; overdue: number }>;

function key(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Deadline calendar.
 *
 * Each day carries a dot when enquiries are due on it, and a day that is
 * already past its deadline is marked with a ring as well as colour, so the
 * urgent days read without relying on hue.
 */
export function CalendarPanel({ data }: { data: CalendarMap }) {
  const today = useMemo(() => new Date(), []);
  const [offset, setOffset] = useState(0);

  const view = new Date(today.getFullYear(), today.getMonth() + offset, 1);
  const year = view.getFullYear();
  const month = view.getMonth();

  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const monthTotal = Object.entries(data)
    .filter(([k]) => k.startsWith(`${year}-${String(month + 1).padStart(2, "0")}`))
    .reduce((s, [, v]) => s + v.due, 0);

  return (
    <div className="px-5 pb-5">
      {/* What the calendar is for, said plainly, before the grid itself. */}
      <p className="mb-4 rounded-xl border border-[var(--app-line)] bg-[var(--app-surface-sunk)] px-3 py-2.5 text-xs leading-relaxed text-[var(--app-ink-2)]">
        Every enquiry has a date by which the next person must act. This shows which days those
        deadlines fall on, so you can see what is about to come due and plan the week around it.
        <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-[var(--app-act-bg)] ring-1 ring-[var(--app-act-line)]" aria-hidden />
            work due
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-[var(--app-late-bg)] ring-1 ring-[var(--app-late-line)]" aria-hidden />
            already late
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-[var(--app-brand)]" aria-hidden />
            today
          </span>
        </span>
      </p>

      <div className="flex items-center justify-between pb-3">
        <p className="text-sm font-bold text-[var(--app-ink)]">
          {MONTH_NAMES[month]} {year}
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => setOffset((o) => o - 1)}
            className="flex h-7 w-7 items-center justify-center rounded-xl border border-[var(--app-line)] text-[var(--app-ink-2)] hover:bg-[var(--app-surface-sunk)]"
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => setOffset((o) => o + 1)}
            className="flex h-7 w-7 items-center justify-center rounded-xl border border-[var(--app-line)] text-[var(--app-ink-2)] hover:bg-[var(--app-surface-sunk)]"
          >
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-y-1 text-center">
        {WEEKDAYS.map((w) => (
          <div key={w} className="pb-1 text-[10px] font-bold uppercase tracking-wide text-[var(--app-ink-3)]">
            {w}
          </div>
        ))}

        {cells.map((day, i) => {
          if (day === null) return <div key={`pad-${i}`} />;
          const cell = data[key(year, month, day)];
          const isToday =
            day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
          const hasOverdue = Boolean(cell?.overdue);
          const hasDue = Boolean(cell?.due);

          return (
            <div key={day} className="flex flex-col items-center">
              <span
                title={
                  cell
                    ? `${cell.due} enquir${cell.due === 1 ? "y" : "ies"} due${
                        cell.overdue ? `, ${cell.overdue} already overdue` : ""
                      }`
                    : undefined
                }
                className={cn(
                  "tnum flex h-8 w-8 items-center justify-center rounded-lg text-xs font-semibold",
                  isToday
                    ? "bg-[var(--app-brand)] text-white"
                    : hasOverdue
                      ? "bg-[var(--app-late-bg)] text-[var(--app-late-ink)] ring-1 ring-[var(--app-late-line)]"
                      : hasDue
                        ? "bg-[var(--app-act-bg)] text-[var(--app-act-ink)]"
                        : "text-[var(--app-ink-2)]"
                )}
              >
                {day}
              </span>
              <span
                className={cn(
                  "mt-0.5 h-1 w-1 rounded-full",
                  hasOverdue
                    ? "bg-[var(--app-late-ink)]"
                    : hasDue
                      ? "bg-[var(--app-act-ink)]"
                      : "bg-transparent"
                )}
                aria-hidden
              />
            </div>
          );
        })}
      </div>

      <p className="mt-4 border-t border-[var(--app-line-soft)] pt-3 text-xs text-[var(--app-ink-3)]">
        {monthTotal > 0 ? (
          <>
            <span className="tnum font-bold text-[var(--app-ink)]">{monthTotal}</span> deadline
            {monthTotal === 1 ? "" : "s"} fall in this month. Hover a day to see how many.
          </>
        ) : (
          "No enquiry deadlines fall in this month."
        )}
      </p>
    </div>
  );
}
