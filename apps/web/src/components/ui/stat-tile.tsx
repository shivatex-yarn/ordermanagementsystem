import * as React from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type StatTone = "brand" | "act" | "wait" | "late" | "done" | "neutral";

const ICON_TONE: Record<StatTone, string> = {
  brand: "bg-[var(--app-brand-tint)] text-[var(--app-brand)]",
  act: "bg-[var(--app-act-bg)] text-[var(--app-act-ink)]",
  wait: "bg-[var(--app-wait-bg)] text-[var(--app-wait-ink)]",
  late: "bg-[var(--app-late-bg)] text-[var(--app-late-ink)]",
  done: "bg-[var(--app-done-bg)] text-[var(--app-done-ink)]",
  neutral: "bg-[var(--app-surface-sunk)] text-[var(--app-ink-2)]",
};

/**
 * StatTile — one headline number.
 *
 * `delta` is written as a sentence fragment ("+12 this week"), never a bare
 * percentage, and its direction is carried by an arrow as well as colour.
 */
export function StatTile({
  label,
  value,
  caption,
  delta,
  deltaDirection,
  deltaIsGood = true,
  icon: Icon,
  tone = "neutral",
  href,
  loading = false,
}: {
  label: string;
  value: React.ReactNode;
  caption?: string;
  delta?: string;
  deltaDirection?: "up" | "down";
  deltaIsGood?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: StatTone;
  href?: string;
  loading?: boolean;
}) {
  const DeltaIcon = deltaDirection === "down" ? ArrowDownRight : ArrowUpRight;
  const deltaInk = deltaIsGood ? "text-[var(--app-done-ink)]" : "text-[var(--app-late-ink)]";

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        {Icon ? (
          <span
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
              ICON_TONE[tone]
            )}
          >
            <Icon className="h-4.5 w-4.5" aria-hidden />
          </span>
        ) : null}
        {delta ? (
          <span className={cn("inline-flex items-center gap-1 text-xs font-bold", deltaInk)}>
            <DeltaIcon className="h-3.5 w-3.5" aria-hidden />
            {delta}
          </span>
        ) : null}
      </div>

      <p className="mt-3.5 text-[1.75rem] font-extrabold leading-none tracking-tight text-[var(--app-ink)]">
        {loading ? <span className="inline-block h-7 w-16 animate-pulse rounded bg-[var(--app-line-soft)]" /> : value}
      </p>
      <p className="mt-1.5 text-sm font-semibold text-[var(--app-ink-2)]">{label}</p>
      {caption ? <p className="mt-0.5 text-xs text-[var(--app-ink-3)]">{caption}</p> : null}
    </>
  );

  const shell =
    "rounded-2xl border border-[var(--app-line)] bg-[var(--app-surface)] p-5 text-left";

  if (href) {
    return (
      <Link href={href} className={cn(shell, "block hover:border-[var(--app-brand-line)] hover:bg-[var(--app-brand-tint)]/30")}>
        {body}
      </Link>
    );
  }
  return <div className={shell}>{body}</div>;
}
