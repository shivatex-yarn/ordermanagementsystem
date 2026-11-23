import { FlaskConical, MessageCircleQuestion, Package } from "lucide-react";
import { cn } from "@/lib/utils";

export type RequestKind = "SAMPLE" | "ORDER" | "ENQUIRY";

const OPTIONS: { value: RequestKind; label: string; help: string; Icon: typeof Package }[] = [
  { value: "SAMPLE", label: "Sample", help: "The customer or client wants a sample. Select Sample.", Icon: FlaskConical },
  { value: "ORDER", label: "Full order", help: "The customer or client wants to place a full order. Select Full order.", Icon: Package },
  { value: "ENQUIRY", label: "Enquiry", help: "The customer or client only has a question. Select Enquiry.", Icon: MessageCircleQuestion },
];

/** Three cards (Sample / Full order / Enquiry) so the person logging the request sees what each choice means. */
export function RequestTypeCards({ value, onChange }: { value: RequestKind; onChange: (v: RequestKind) => void }) {
  return (
    <div role="radiogroup" aria-label="What does the customer or client want?" className="grid gap-3 sm:grid-cols-3">
      {OPTIONS.map(({ value: v, label, help, Icon }) => {
        const on = value === v;
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(v)}
            className={cn(
              "rounded-xl border p-4 text-left transition-colors",
              on
                ? "border-[var(--app-brand)] bg-[var(--app-brand-tint)] ring-1 ring-[var(--app-brand)]"
                : "border-[var(--app-line)] bg-white hover:border-[var(--app-ink-3)]"
            )}
          >
            <Icon className={cn("h-5 w-5", on ? "text-[var(--app-brand)]" : "text-[var(--app-ink-2)]")} aria-hidden />
            <p className="mt-2 text-sm font-semibold text-[var(--app-ink)]">{label}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-[var(--app-ink-3)]">{help}</p>
          </button>
        );
      })}
    </div>
  );
}
