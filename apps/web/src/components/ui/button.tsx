import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-[var(--app-brand)] text-white hover:bg-[var(--app-brand-strong)] focus-visible:ring-[var(--app-brand)]",
        destructive: "bg-[var(--app-late-ink)] text-white hover:opacity-90 focus-visible:ring-[var(--app-late-ink)]",
        outline: "border border-[var(--app-line)] bg-white text-[var(--app-ink-2)] hover:bg-[var(--app-surface-sunk)] focus-visible:ring-[var(--app-brand)]",
        secondary: "bg-[var(--app-surface-sunk)] text-[var(--app-ink)] hover:bg-[var(--app-line-soft)] focus-visible:ring-[var(--app-brand)]",
        ghost: "text-[var(--app-ink-2)] hover:bg-[var(--app-surface-sunk)] hover:text-[var(--app-ink)]",
        link: "text-[var(--app-brand)] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-lg px-3",
        lg: "h-11 rounded-xl px-8",
        icon: "h-10 w-10 rounded-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size }), className)}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
