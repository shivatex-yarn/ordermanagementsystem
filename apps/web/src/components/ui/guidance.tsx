import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Info,
  Lock,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The four states any piece of work can be in, from the point of view of the
 * person looking at the screen. Every guidance component speaks in these terms
 * so "whose move is it?" is answerable at a glance.
 *
 *   act   — it is your move, do this now
 *   wait  — someone else owes the next move
 *   late  — past its deadline
 *   done  — finished, nothing to do
 *   info  — neutral explanation
 */
export type Tone = "act" | "wait" | "late" | "done" | "info";

const TONE: Record<
  Tone,
  { bg: string; line: string; ink: string; icon: React.ComponentType<{ className?: string }> }
> = {
  act: {
    bg: "bg-[var(--app-act-bg)]",
    line: "border-[var(--app-act-line)]",
    ink: "text-[var(--app-act-ink)]",
    icon: AlertTriangle,
  },
  wait: {
    bg: "bg-[var(--app-wait-bg)]",
    line: "border-[var(--app-wait-line)]",
    ink: "text-[var(--app-wait-ink)]",
    icon: Clock,
  },
  late: {
    bg: "bg-[var(--app-late-bg)]",
    line: "border-[var(--app-late-line)]",
    ink: "text-[var(--app-late-ink)]",
    icon: AlertTriangle,
  },
  done: {
    bg: "bg-[var(--app-done-bg)]",
    line: "border-[var(--app-done-line)]",
    ink: "text-[var(--app-done-ink)]",
    icon: CheckCircle2,
  },
  info: {
    bg: "bg-[var(--app-surface-sunk)]",
    line: "border-[var(--app-line)]",
    ink: "text-[var(--app-ink-2)]",
    icon: Info,
  },
};

/** Icon + label together, so a colour never carries the meaning on its own. */
export function ToneBadge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  const t = TONE[tone];
  const Icon = t.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold",
        t.bg,
        t.line,
        t.ink
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {children}
    </span>
  );
}

/**
 * NextStep — the banner that answers "what do I do now?".
 *
 * Every dashboard shows exactly one, at the top, above everything else. It
 * names the single most important thing the signed-in person should do, says
 * why, and links straight to the screen where they do it.
 */
export function NextStep({
  tone = "act",
  eyebrow = "Your next step",
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
  secondary,
  className,
}: {
  tone?: Tone;
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  secondary?: React.ReactNode;
  className?: string;
}) {
  const t = TONE[tone];
  const Icon = t.icon;
  const buttonClasses =
    "inline-flex h-10 w-full shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[var(--app-ink)] px-4 text-sm font-semibold text-white hover:bg-black sm:w-auto";

  return (
    <section
      aria-label={typeof eyebrow === "string" ? eyebrow : "Next step"}
      className={cn("rounded-2xl border p-4 sm:p-5", t.bg, t.line, className)}
    >
      <div className="flex flex-wrap items-start gap-4">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border bg-white/70",
            t.line
          )}
        >
          <Icon className={cn("h-4.5 w-4.5", t.ink)} aria-hidden />
        </span>

        <div className="min-w-[13rem] flex-1">
          <p className={cn("text-[11px] font-bold uppercase tracking-[0.14em]", t.ink)}>{eyebrow}</p>
          <p className="mt-1 text-base font-bold leading-snug text-[var(--app-ink)]">{title}</p>
          {description ? (
            <p className="mt-1 text-sm leading-relaxed text-[var(--app-ink-2)]">{description}</p>
          ) : null}
          {secondary ? <div className="mt-3">{secondary}</div> : null}
        </div>

        {actionHref && actionLabel ? (
          <Link href={actionHref} className={buttonClasses}>
            {actionLabel}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        ) : null}
        {!actionHref && onAction && actionLabel ? (
          <button type="button" onClick={onAction} className={buttonClasses}>
            {actionLabel}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
      </div>
    </section>
  );
}

/** Inline explanation placed next to the thing it is about. */
export function Callout({
  tone = "info",
  title,
  children,
  action,
  className,
}: {
  tone?: Tone;
  title?: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  const t = TONE[tone];
  const Icon = t.icon;
  return (
    <div className={cn("rounded-xl border px-4 py-3", t.bg, t.line, className)}>
      <div className="flex items-start gap-3">
        <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", t.ink)} aria-hidden />
        <div className="min-w-0 flex-1">
          {title ? (
            <p className={cn("text-sm font-bold leading-snug", t.ink)}>{title}</p>
          ) : null}
          {children ? (
            <div className="mt-0.5 text-sm leading-relaxed text-[var(--app-ink-2)]">{children}</div>
          ) : null}
          {action ? <div className="mt-2.5">{action}</div> : null}
        </div>
      </div>
    </div>
  );
}

/**
 * ActionGuard — wraps a control that the signed-in person may not be allowed
 * to use yet.
 *
 * When `allowed` is false it replaces the control with a plain-language reason
 * and, where we know it, the name of the person who *can* act. That is the
 * difference between a dead button and an answer.
 */
export function ActionGuard({
  allowed,
  reason,
  owner,
  children,
}: {
  allowed: boolean;
  reason: string;
  /** Who is able to do this instead, e.g. "Ravi Kumar (Operations Head)". */
  owner?: string | null;
  children: React.ReactNode;
}) {
  if (allowed) return <>{children}</>;
  return (
    <div className="rounded-xl border border-[var(--app-wait-line)] bg-[var(--app-wait-bg)] px-4 py-3">
      <div className="flex items-start gap-3">
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-[var(--app-wait-ink)]" aria-hidden />
        <div className="min-w-0">
          <p className="text-sm font-bold text-[var(--app-wait-ink)]">You cannot do this step</p>
          <p className="mt-0.5 text-sm leading-relaxed text-[var(--app-ink-2)]">{reason}</p>
          {owner ? (
            <p className="mt-1.5 text-sm text-[var(--app-ink-2)]">
              Waiting on <span className="font-semibold text-[var(--app-ink)]">{owner}</span>.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * MissingAssignee — the specific, loud case of "this enquiry has nobody
 * working on it". Highlighted because it is the most common reason an enquiry
 * silently stalls.
 */
export function MissingAssignee({
  message = "No production person is assigned to this enquiry yet. Nothing will move until someone is.",
  actionLabel,
  actionHref,
  onAction,
}: {
  message?: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
}) {
  return (
    <div className="rounded-xl border border-[var(--app-act-line)] bg-[var(--app-act-bg)] px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <UserPlus className="h-4 w-4 shrink-0 text-[var(--app-act-ink)]" aria-hidden />
        <p className="min-w-0 flex-1 text-sm font-semibold text-[var(--app-act-ink)]">{message}</p>
        {actionHref && actionLabel ? (
          <Link
            href={actionHref}
            className="inline-flex h-9 items-center rounded-lg bg-[var(--app-act-ink)] px-3 text-xs font-bold text-white hover:opacity-90"
          >
            {actionLabel}
          </Link>
        ) : null}
        {!actionHref && onAction && actionLabel ? (
          <button
            type="button"
            onClick={onAction}
            className="inline-flex h-9 items-center rounded-lg bg-[var(--app-act-ink)] px-3 text-xs font-bold text-white hover:opacity-90"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export type GuidedStep = {
  label: string;
  /** Who owns this step — shown under the label so nobody has to guess. */
  owner?: string;
  state: "done" | "current" | "blocked" | "upcoming";
  /** Only on the current/blocked step: what has to happen. */
  hint?: string;
};

/**
 * StepTracker — the whole enquiry journey as a numbered list, with the current
 * step called out and every step labelled with whose job it is.
 */
export function StepTracker({ steps, className }: { steps: GuidedStep[]; className?: string }) {
  return (
    <ol className={cn("space-y-0", className)}>
      {steps.map((s, i) => {
        const isLast = i === steps.length - 1;
        const marker =
          s.state === "done"
            ? "border-[var(--app-done-line)] bg-[var(--app-done-bg)] text-[var(--app-done-ink)]"
            : s.state === "current"
              ? "border-[var(--app-act-line)] bg-[var(--app-act-ink)] text-white"
              : s.state === "blocked"
                ? "border-[var(--app-wait-line)] bg-[var(--app-wait-bg)] text-[var(--app-wait-ink)]"
                : "border-[var(--app-line)] bg-white text-[var(--app-ink-3)]";

        return (
          <li key={s.label} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold",
                  marker
                )}
              >
                {s.state === "done" ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : i + 1}
              </span>
              {!isLast ? (
                <span
                  className={cn(
                    "w-px flex-1",
                    s.state === "done" ? "bg-[var(--app-done-line)]" : "bg-[var(--app-line)]"
                  )}
                />
              ) : null}
            </div>

            <div className={cn("min-w-0 flex-1", isLast ? "pb-0" : "pb-5")}>
              <p
                className={cn(
                  "text-sm font-semibold leading-tight",
                  s.state === "upcoming" ? "text-[var(--app-ink-3)]" : "text-[var(--app-ink)]"
                )}
              >
                {s.label}
              </p>
              {s.owner ? (
                <p className="mt-0.5 text-xs text-[var(--app-ink-3)]">{s.owner}</p>
              ) : null}
              {s.hint ? (
                <p
                  className={cn(
                    "mt-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium leading-relaxed",
                    s.state === "blocked"
                      ? "border-[var(--app-wait-line)] bg-[var(--app-wait-bg)] text-[var(--app-wait-ink)]"
                      : "border-[var(--app-act-line)] bg-[var(--app-act-bg)] text-[var(--app-act-ink)]"
                  )}
                >
                  {s.hint}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
