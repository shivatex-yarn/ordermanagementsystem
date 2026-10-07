import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold transition-colors",
  {
    variants: {
      variant: {
        default: "border-[var(--app-brand-line)] bg-[var(--app-brand-tint)] text-[var(--app-brand-strong)]",
        secondary: "border-[var(--app-line)] bg-[var(--app-surface-sunk)] text-[var(--app-ink-2)]",
        destructive: "border-[var(--app-late-line)] bg-[var(--app-late-bg)] text-[var(--app-late-ink)]",
        outline: "border-[var(--app-line)] bg-white text-[var(--app-ink-2)]",
        success: "border-[var(--app-done-line)] bg-[var(--app-done-bg)] text-[var(--app-done-ink)]",
        warning: "border-[var(--app-act-line)] bg-[var(--app-act-bg)] text-[var(--app-act-ink)]",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
