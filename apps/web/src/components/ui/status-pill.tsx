import * as React from "react";
import {
  Ban,
  CheckCircle2,
  CircleDashed,
  Loader2,
  Send,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Spec = {
  label: string;
  classes: string;
  icon: React.ComponentType<{ className?: string }>;
};

/**
 * Every status gets an icon and a word, never a bare colour — so the state is
 * readable in greyscale, in print, and by colour-blind users.
 */
const STATUS: Record<string, Spec> = {
  PLACED: {
    label: "Awaiting acceptance",
    classes: "border-[var(--app-act-line)] bg-[var(--app-act-bg)] text-[var(--app-act-ink)]",
    icon: CircleDashed,
  },
  IN_PROGRESS: {
    label: "In progress",
    classes: "border-[var(--app-wait-line)] bg-[var(--app-wait-bg)] text-[var(--app-wait-ink)]",
    icon: Loader2,
  },
  TRANSFERRED: {
    label: "Transferred",
    classes: "border-[var(--app-line)] bg-[var(--app-surface-sunk)] text-[var(--app-ink-2)]",
    icon: Send,
  },
  COMPLETED: {
    label: "Completed",
    classes: "border-[var(--app-done-line)] bg-[var(--app-done-bg)] text-[var(--app-done-ink)]",
    icon: CheckCircle2,
  },
  REJECTED: {
    label: "Rejected",
    classes: "border-[var(--app-late-line)] bg-[var(--app-late-bg)] text-[var(--app-late-ink)]",
    icon: XCircle,
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

export function StatusPill({
  status,
  className,
  size = "md",
}: {
  status: string;
  className?: string;
  size?: "sm" | "md";
}) {
  const spec = STATUS[status] ?? {
    label: status,
    classes: "border-[var(--app-line)] bg-[var(--app-surface-sunk)] text-[var(--app-ink-2)]",
    icon: CircleDashed,
  };
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

const PRIORITY: Record<string, { label: string; classes: string }> = {
  CRITICAL: {
    label: "Critical",
    classes: "border-[var(--app-late-line)] bg-[var(--app-late-bg)] text-[var(--app-late-ink)]",
  },
  HIGH: {
    label: "High",
    classes: "border-[var(--app-act-line)] bg-[var(--app-act-bg)] text-[var(--app-act-ink)]",
  },
  NORMAL: {
    label: "Normal",
    classes: "border-[var(--app-line)] bg-[var(--app-surface-sunk)] text-[var(--app-ink-2)]",
  },
  LOW: {
    label: "Low",
    classes: "border-[var(--app-line)] bg-white text-[var(--app-ink-3)]",
  },
};

export function PriorityPill({ priority, className }: { priority?: string | null; className?: string }) {
  if (!priority) return null;
  const spec = PRIORITY[priority] ?? PRIORITY.NORMAL;
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        spec.classes,
        className
      )}
    >
      {spec.label}
    </span>
  );
}
