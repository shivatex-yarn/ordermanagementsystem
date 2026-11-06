export function StatusBadge({ status }: { status: "PENDING" | "APPROVED" | "REJECTED" }) {
  const map = {
    PENDING: "border-[var(--app-act-line)] bg-[var(--app-act-bg)] text-[var(--app-act-ink)]",
    APPROVED: "border-[var(--app-done-line)] bg-[var(--app-done-bg)] text-[var(--app-done-ink)]",
    REJECTED: "border-[var(--app-late-line)] bg-[var(--app-late-bg)] text-[var(--app-late-ink)]",
  } as const;
  const label = { PENDING: "Waiting for admin", APPROVED: "Approved", REJECTED: "Declined" } as const;
  return <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${map[status]}`}>{label[status]}</span>;
}
