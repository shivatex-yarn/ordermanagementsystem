import * as React from "react";
import { Ban, CheckCircle2, CircleDashed, Hourglass } from "lucide-react";
import { cn } from "@/lib/utils";

type Spec = { label: string; classes: string; icon: React.ComponentType<{ className?: string }> };

/** Every status carries an icon and a word, never a bare colour. */
const STATUS: Record<string, Spec> = {
  PLACED: {
    label: "Needs pricing",
    classes: "border-[var(--app-act-line)] bg-[var(--app-act-bg)] text-[var(--app-act-ink)]",
    icon: CircleDashed,
  },
  PRICED: {
    label: "Waiting for client",
    classes: "border-[var(--app-wait-line)] bg-[var(--app-wait-bg)] text-[var(--app-wait-ink)]",
    icon: Hourglass,
  },
  CLOSED: {
    label: "Closed",
    classes: "border-[var(--app-done-line)] bg-[var(--app-done-bg)] text-[var(--app-done-ink)]",
    icon: CheckCircle2,
  },
  CANCELLED: {
    label: "Cancelled",
    classes: "border-[var(--app-line)] bg-[var(--app-surface-sunk)] text-[var(--app-ink-3)]",
    icon: Ban,
  },
};

export function statusLabel(status: string): string {
  return STATUS[status]?.label ?? status;
}

export function StatusPill({ status, className, size = "md" }: { status: string; className?: string; size?: "sm" | "md" }) {
  const spec = STATUS[status] ?? STATUS.PLACED;
  const Icon = spec.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border font-bold",
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]",
        spec.classes,
        className
      )}
    >
      <Icon className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} aria-hidden />
      {spec.label}
    </span>
  );
}
