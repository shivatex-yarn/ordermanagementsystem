import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Panel — the single card surface every screen is built from.
 * One border, one radius, no competing shadows.
 */
export function Panel({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-[var(--app-line)] bg-[var(--app-surface)]",
        className
      )}
      {...props}
    />
  );
}

/**
 * PanelHeader — title row with optional caption and a trailing slot for
 * filters or a "view all" link.
 */
export function PanelHeader({
  title,
  caption,
  action,
  className,
}: {
  title: React.ReactNode;
  caption?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-3 border-b border-[var(--app-line-soft)] px-5 py-4",
        className
      )}
    >
      <div className="min-w-0">
        <h2 className="text-[0.95rem] font-bold leading-tight tracking-tight text-[var(--app-ink)]">
          {title}
        </h2>
        {caption ? (
          <p className="mt-0.5 text-xs leading-snug text-[var(--app-ink-3)]">{caption}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/** Quiet "see everything" link used in panel headers. */
export function PanelLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 rounded-md text-xs font-semibold text-[var(--app-brand)] hover:text-[var(--app-brand-strong)] hover:underline"
    >
      {children}
      <ArrowRight className="h-3.5 w-3.5" aria-hidden />
    </Link>
  );
}

/** Page title block, used at the top of every route. */
export function PageHeader({
  title,
  description,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-extrabold tracking-tight text-[var(--app-ink)]">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[var(--app-ink-2)]">
            {description}
          </p>
        ) : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}

/** Shown wherever a list has nothing in it, so a blank area never reads as a bug. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-12 text-center", className)}>
      {Icon ? (
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--app-brand-tint)]">
          <Icon className="h-5 w-5 text-[var(--app-brand)]" />
        </div>
      ) : null}
      <p className="text-sm font-semibold text-[var(--app-ink)]">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-xs leading-relaxed text-[var(--app-ink-3)]">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/** Loading placeholder matching the panel geometry. */
export function PanelSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-2xl border border-[var(--app-line)] bg-[var(--app-surface-sunk)]",
        className
      )}
      aria-hidden
    />
  );
}
