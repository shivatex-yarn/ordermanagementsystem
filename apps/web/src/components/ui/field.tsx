import * as React from "react";
import { cn } from "@/lib/utils";

/** Label + control + hint, with an "Optional" tag when the field isn't required. */
export function Field({
  label,
  optional,
  hint,
  className,
  children,
  htmlFor,
}: {
  label: string;
  optional?: boolean;
  hint?: string;
  className?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="flex items-center gap-2 text-xs font-semibold text-[var(--app-ink-2)]">
        {label}
        {optional ? (
          <span className="rounded-full bg-[var(--app-surface-sunk)] px-2 py-0.5 text-[10px] font-semibold text-[var(--app-ink-3)]">
            Optional
          </span>
        ) : null}
      </label>
      {children}
      {hint ? <p className="text-[11px] text-[var(--app-ink-3)]">{hint}</p> : null}
    </div>
  );
}

export const textareaClass =
  "flex min-h-[88px] w-full rounded-xl border border-[var(--app-line)] bg-white px-3.5 py-2.5 text-sm text-[var(--app-ink)] placeholder:text-[var(--app-ink-3)] focus-visible:border-[var(--app-brand-line)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]/20";

export const selectClass =
  "flex h-10 w-full rounded-xl border border-[var(--app-line)] bg-white px-3 text-sm text-[var(--app-ink)] focus-visible:border-[var(--app-brand-line)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]/20";

/** Segmented Yes / No style choice. */
export function Segmented<T extends string | boolean>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div role="radiogroup" className="inline-flex rounded-xl border border-[var(--app-line)] bg-[var(--app-surface-sunk)] p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors",
            value === o.value ? "bg-white text-[var(--app-brand)] shadow-sm" : "text-[var(--app-ink-3)] hover:text-[var(--app-ink)]"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-xl border border-[var(--app-late-line)] bg-[var(--app-late-bg)] px-4 py-3 text-sm text-[var(--app-late-ink)]">
      {message}
    </div>
  );
}
