import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/** Logged → Priced → (Sample) → Client replied → Closed, with finished steps filled in. */
export function EnquiryStepper({ isSample, priced, sampleSent, replied, closed, cancelled, size = "md" }: {
  isSample: boolean; priced: boolean; sampleSent: boolean; replied: boolean; closed: boolean; cancelled?: boolean; size?: "sm" | "md";
}) {
  const steps = [
    { label: "Logged", done: true },
    { label: "Priced", done: priced },
    ...(isSample ? [{ label: "Sample", done: sampleSent }] : []),
    { label: "Client replied", done: replied },
    { label: "Closed", done: closed },
  ];
  const current = steps.findIndex((s) => !s.done);
  const dot = size === "sm" ? "h-5 w-5" : "h-7 w-7";
  return (
    <ol className="flex items-start" aria-label="Progress">
      {steps.map((s, i) => (
        <li key={s.label} className={cn("flex min-w-0 flex-1 flex-col items-center", i > 0 && "relative")}>
          {i > 0 ? <span aria-hidden className={cn("absolute right-1/2 top-2.5 h-0.5 w-full -translate-y-1/2", size === "md" && "top-3.5", steps[i].done || (cancelled ? false : steps[i - 1].done && i === current) ? "bg-[var(--app-brand)]" : "bg-[var(--app-line)]")} /> : null}
          <span className={cn("relative z-10 flex items-center justify-center rounded-full border-2 text-[10px] font-bold", dot,
            s.done ? "border-[var(--app-brand)] bg-[var(--app-brand)] text-white" : !cancelled && i === current ? "border-[var(--app-brand)] bg-white text-[var(--app-brand)]" : "border-[var(--app-line)] bg-white text-[var(--app-ink-3)]")}>
            {s.done ? <Check className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} aria-hidden /> : i + 1}
          </span>
          <span className={cn("mt-1.5 truncate text-center font-semibold", size === "sm" ? "text-[10px]" : "text-[11px]", s.done ? "text-[var(--app-ink)]" : "text-[var(--app-ink-3)]")}>{s.label}</span>
        </li>
      ))}
    </ol>
  );
}
