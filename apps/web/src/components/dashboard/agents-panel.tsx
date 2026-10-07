"use client";

import { Users } from "lucide-react";
import { EmptyState } from "@/components/ui/panel";
import { roleLabel } from "@/lib/roles";
import { SERIES } from "@/lib/chart-palette";

export type Agent = {
  id: number;
  name: string;
  role: string;
  division: string | null;
  submitted: number;
  completed: number;
};

/**
 * Who is carrying the work. Submitted is the ranking measure; the bar shows
 * how much of each person's book has actually closed, which is the number a
 * head cares about.
 */
export function AgentsPanel({ agents }: { agents: Agent[] }) {
  if (agents.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No activity yet"
        description="Once people start submitting enquiries they will be ranked here."
      />
    );
  }
  const max = Math.max(...agents.map((a) => a.submitted), 1);

  return (
    <ul className="divide-y divide-[var(--app-line-soft)]">
      {agents.map((a, i) => {
        const initials = a.name
          .split(" ")
          .map((n) => n[0])
          .join("")
          .toUpperCase()
          .slice(0, 2);
        const closedPct = a.submitted > 0 ? Math.round((a.completed / a.submitted) * 100) : 0;
        return (
          <li key={a.id} className="flex items-center gap-3 px-5 py-3">
            <span className="tnum w-4 shrink-0 text-xs font-bold text-[var(--app-ink-3)]">{i + 1}</span>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--app-brand-tint)] text-[11px] font-bold text-[var(--app-brand)]">
              {initials}
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-[var(--app-ink)]">{a.name}</p>
              <p className="truncate text-xs text-[var(--app-ink-3)]">
                {roleLabel(a.role as Parameters<typeof roleLabel>[0])}
                {a.division ? ` · ${a.division}` : ""}
              </p>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--app-line-soft)]">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(4, (a.submitted / max) * 100)}%`,
                    background: SERIES.primary,
                  }}
                />
              </div>
            </div>

            <div className="shrink-0 text-right">
              <p className="tnum text-sm font-extrabold text-[var(--app-ink)]">{a.submitted}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--app-ink-3)]">
                {closedPct}% closed
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
