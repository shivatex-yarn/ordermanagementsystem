/** Calendar filters for enquiry lists (server and UI use the same period keys). */
export type EnquiryPeriodFilter = "today" | "week" | "month" | "year" | "";

export function normalizePeriodParam(raw: string | null): EnquiryPeriodFilter {
  if (!raw) return "";
  const p = raw.toLowerCase();
  if (p === "yearly") return "year";
  if (p === "today" || p === "week" || p === "month" || p === "year") return p;
  return "";
}

/** Inclusive start/end of day in local server TZ for `createdAt` filtering. */
export function getCreatedAtRange(period: EnquiryPeriodFilter): { gte: Date; lte: Date } | null {
  if (!period) return null;
  const now = new Date();
  const lte = new Date(now);
  lte.setHours(23, 59, 59, 999);
  const gte = new Date(now);
  gte.setHours(0, 0, 0, 0);
  switch (period) {
    case "today":
      return { gte, lte };
    case "week": {
      const day = gte.getDay();
      const mondayOffset = day === 0 ? -6 : 1 - day;
      gte.setDate(gte.getDate() + mondayOffset);
      return { gte, lte };
    }
    case "month":
      gte.setDate(1);
      return { gte, lte };
    case "year":
      gte.setMonth(0, 1);
      return { gte, lte };
    default:
      return null;
  }
}

export const PERIOD_LABELS: { value: EnquiryPeriodFilter; label: string }[] = [
  { value: "", label: "All time" },
  { value: "today", label: "Today" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year / yearly" },
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Inclusive UTC day range from HTML date inputs (`YYYY-MM-DD`). Max span enforced server-side. */
export function parseCreatedAtRangeFromParams(
  fromRaw: string | null,
  toRaw: string | null,
  maxSpanDays = 1095
): { gte: Date; lte: Date } | null {
  if (!fromRaw || !toRaw || !ISO_DATE.test(fromRaw) || !ISO_DATE.test(toRaw)) return null;
  const gte = new Date(`${fromRaw}T00:00:00.000Z`);
  const lte = new Date(`${toRaw}T23:59:59.999Z`);
  if (Number.isNaN(gte.getTime()) || Number.isNaN(lte.getTime()) || gte > lte) return null;
  const spanMs = lte.getTime() - gte.getTime();
  if (spanMs > maxSpanDays * 24 * 60 * 60 * 1000) return null;
  return { gte, lte };
}
