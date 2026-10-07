import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        "flex h-10 w-full rounded-xl border border-[var(--app-line)] bg-white px-3.5 py-2 text-sm text-[var(--app-ink)] file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-[var(--app-ink-3)] focus-visible:border-[var(--app-brand-line)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-brand)]/20 disabled:cursor-not-allowed disabled:bg-[var(--app-surface-sunk)] disabled:opacity-60",
        className
      )}
      ref={ref}
      {...props}
    />
  )
);
Input.displayName = "Input";

export { Input };
