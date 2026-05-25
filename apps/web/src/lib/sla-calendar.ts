/**
 * SLA Business-Hours Calendar — Indian public holidays + working-hour rules.
 *
 * Business hours: Monday – Saturday, 10:00 AM – 6:00 PM IST (UTC+5:30)
 * Non-working: Sundays, Indian public holidays, and times outside 10:00–18:00 IST.
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  MAINTENANCE: add/update the year-specific MOVABLE_HOLIDAYS entries │
 * │  at the start of each calendar year.                                │
 * └─────────────────────────────────────────────────────────────────────┘
 */

// ---------------------------------------------------------------------------
// IST helpers (IST = UTC + 5h 30min)
// ---------------------------------------------------------------------------

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/** Returns a plain-object representation of `utcDate` in Indian Standard Time. */
function toIST(utcDate: Date): {
  year: number;
  month: number; // 1–12
  day: number;   // 1–31
  hour: number;  // 0–23
  minute: number;
  dayOfWeek: number; // 0=Sun, 1=Mon … 6=Sat
} {
  const ms = utcDate.getTime() + IST_OFFSET_MS;
  const d = new Date(ms);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    dayOfWeek: d.getUTCDay(),
  };
}

/** Formats a UTC date as an IST calendar date string: "YYYY-MM-DD". */
function istDateKey(utcDate: Date): string {
  const { year, month, day } = toIST(utcDate);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Indian public holidays
// ---------------------------------------------------------------------------

/**
 * Fixed-date national / gazetted holidays (MM-DD, repeat every year).
 * These never move in the Gregorian calendar.
 */
const FIXED_HOLIDAYS_MM_DD = new Set([
  "01-26", // Republic Day
  "04-14", // Dr. B.R. Ambedkar Jayanti
  "08-15", // Independence Day
  "10-02", // Gandhi Jayanti
  "12-25", // Christmas Day
]);

/**
 * Movable / lunar-calendar holidays (full YYYY-MM-DD).
 * Update this list at the start of each new calendar year.
 *
 * Sources: Ministry of Personnel (India) Gazette notifications,
 * and published Islamic / Hindu calendar projections.
 */
const MOVABLE_HOLIDAYS = new Set([
  // ── 2025 ──────────────────────────────────────────────────────────────────
  "2025-01-14", // Makar Sankranti / Pongal
  "2025-02-26", // Maha Shivaratri
  "2025-03-14", // Holi
  "2025-03-31", // Eid-ul-Fitr
  "2025-04-06", // Ram Navami
  "2025-04-10", // Mahavir Jayanti
  "2025-04-18", // Good Friday
  "2025-05-01", // Maharashtra Day / Labour Day
  "2025-05-12", // Buddha Purnima
  "2025-06-07", // Eid-ul-Adha (Bakrid)
  "2025-07-06", // Muharram (Ashura)
  "2025-08-09", // Raksha Bandhan
  "2025-08-16", // Janmashtami
  "2025-09-05", // Milad-un-Nabi (Prophet's Birthday)
  "2025-10-02", // Dussehra (same date as Gandhi Jayanti in 2025)
  "2025-10-20", // Diwali – Lakshmi Puja
  "2025-10-21", // Govardhan Puja
  "2025-11-05", // Guru Nanak Jayanti

  // ── 2026 ──────────────────────────────────────────────────────────────────
  "2026-01-14", // Makar Sankranti / Pongal
  "2026-02-15", // Maha Shivaratri
  "2026-03-03", // Holi
  "2026-03-20", // Eid-ul-Fitr
  "2026-03-27", // Ram Navami
  "2026-03-29", // Mahavir Jayanti
  "2026-04-03", // Good Friday
  "2026-05-01", // Maharashtra Day / Labour Day
  "2026-05-27", // Eid-ul-Adha (Bakrid)
  "2026-05-31", // Buddha Purnima
  "2026-06-26", // Muharram (Ashura)
  "2026-07-29", // Raksha Bandhan
  "2026-08-05", // Janmashtami
  "2026-08-15", // Independence Day (fixed — listed here for clarity)
  "2026-08-25", // Milad-un-Nabi
  "2026-10-21", // Dussehra
  "2026-10-24", // Guru Nanak Jayanti
  "2026-11-08", // Diwali – Lakshmi Puja
  "2026-11-09", // Govardhan Puja

  // ── 2027 ──────────────────────────────────────────────────────────────────
  "2027-01-14", // Makar Sankranti / Pongal
  "2027-02-04", // Maha Shivaratri
  "2027-03-09", // Eid-ul-Fitr
  "2027-03-22", // Holi
  "2027-03-26", // Good Friday (Easter: March 28)
  "2027-04-15", // Ram Navami
  "2027-04-17", // Mahavir Jayanti
  "2027-05-01", // Maharashtra Day / Labour Day
  "2027-05-17", // Eid-ul-Adha (Bakrid)
  "2027-05-21", // Buddha Purnima
  "2027-06-15", // Muharram (Ashura)
  "2027-08-15", // Independence Day
  "2027-08-17", // Janmashtami
  "2027-09-14", // Milad-un-Nabi
  "2027-10-11", // Dussehra
  "2027-10-28", // Diwali – Lakshmi Puja
  "2027-11-14", // Guru Nanak Jayanti
]);

/**
 * Returns `true` if the given UTC instant falls on an Indian public holiday
 * (evaluated in IST calendar date).
 */
export function isIndianHoliday(utcDate: Date): boolean {
  const { month, day } = toIST(utcDate);
  const mmdd = `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (FIXED_HOLIDAYS_MM_DD.has(mmdd)) return true;
  return MOVABLE_HOLIDAYS.has(istDateKey(utcDate));
}

// ---------------------------------------------------------------------------
// Working-day / business-hours checks
// ---------------------------------------------------------------------------

/**
 * Returns `true` if the given UTC instant is a working day:
 * Monday–Saturday in IST, and NOT an Indian public holiday.
 */
export function isWorkingDay(utcDate: Date): boolean {
  const { dayOfWeek } = toIST(utcDate);
  if (dayOfWeek === 0) return false; // Sunday
  return !isIndianHoliday(utcDate);
}

/**
 * Returns `true` if the given UTC instant falls within SLA business hours:
 * 10:00 AM – 6:00 PM IST on a working day (Mon–Sat, non-holiday).
 */
export function isWithinSlaBusinessHours(utcDate: Date): boolean {
  if (!isWorkingDay(utcDate)) return false;
  const { hour, minute } = toIST(utcDate);
  const totalMinutes = hour * 60 + minute;
  return totalMinutes >= 10 * 60 && totalMinutes < 18 * 60; // [10:00, 18:00)
}

// ---------------------------------------------------------------------------
// Deadline helpers
// ---------------------------------------------------------------------------

/**
 * If `utcDate` falls on a non-working day (Sunday or Indian holiday), advances
 * it day-by-day until it lands on a working day, preserving the time-of-day.
 * Caps at 14 iterations (safety guard against infinite loops in bad data).
 */
export function advancePastNonWorkingDay(utcDate: Date): Date {
  const result = new Date(utcDate);
  let iterations = 0;
  while (!isWorkingDay(result)) {
    result.setUTCDate(result.getUTCDate() + 1);
    if (++iterations > 14) break;
  }
  return result;
}
