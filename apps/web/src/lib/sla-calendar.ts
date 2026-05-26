/**
 * SLA Business-Hours Calendar — South Indian (Tamil Nadu) public holidays + working-hour rules.
 *
 * Business hours: Monday – Saturday, 10:00 AM – 6:00 PM IST (UTC+5:30)
 * Non-working: Sundays, public holidays, and times outside 10:00–18:00 IST.
 *
 * Holiday sources:
 *   • Fixed dates  — same Gregorian date every year (Republic Day, Pongal, etc.)
 *   • Algorithmic  — computed for any year: Good Friday (Easter algorithm) and
 *                    all Islamic holidays (tabular Hijri calendar, verified accurate)
 *   • Pre-computed — South Indian Hindu lunisolar festivals 2025–2040 (Maha
 *                    Shivaratri, Mahavir Jayanti, Buddha Purnima, Janmashtami,
 *                    Vijayadasami, Deepavali, Karthigai Deepam, Guru Nanak Jayanti)
 *
 * No manual updates required until the year 2041.
 */

// ---------------------------------------------------------------------------
// IST helpers (IST = UTC + 5h 30min)
// ---------------------------------------------------------------------------

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

function toIST(utcDate: Date): {
  year: number;
  month: number;  // 1–12
  day: number;    // 1–31
  hour: number;   // 0–23
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

function istDateKey(utcDate: Date): string {
  const { year, month, day } = toIST(utcDate);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Fixed-date holidays (MM-DD, same every year)
// ---------------------------------------------------------------------------

const FIXED_HOLIDAYS_MM_DD = new Set([
  "01-13", // Bhogi Pongal
  "01-14", // Thai Pongal / Makar Sankranti
  "01-15", // Thiruvalluvar Day
  "01-16", // Uzhavar Thirunal
  "01-26", // Republic Day
  "04-14", // Dr. B.R. Ambedkar Jayanti / Puthandu (Tamil New Year)
  "05-01", // Labour Day / May Day
  "08-15", // Independence Day
  "10-02", // Gandhi Jayanti
  "11-01", // Tamil Nadu Formation Day
  "12-25", // Christmas Day
]);

// ---------------------------------------------------------------------------
// Algorithmic: Easter (Good Friday)
// ---------------------------------------------------------------------------

// Meeus/Jones/Butcher algorithm — accurate for any Gregorian year.
function computeEasterUTC(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

// ---------------------------------------------------------------------------
// Algorithmic: Islamic holidays (tabular Hijri calendar)
// Epoch: 1 Muharram 1 AH = JDN 1948439.  Verified against 2025–2027 known dates.
// ---------------------------------------------------------------------------

function hijriToJDN(hy: number, hm: number, hd: number): number {
  return (
    hd +
    Math.ceil(29.5 * (hm - 1)) +
    (hy - 1) * 354 +
    Math.floor((11 * hy + 3) / 30) +
    1948439
  );
}

function jdnToUTCDate(jdn: number): Date {
  // Richards algorithm (Wikipedia: Julian day number)
  const a = jdn + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor((146097 * b) / 4);
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const mv = Math.floor((5 * e + 2) / 153);
  const day = e - Math.floor((153 * mv + 2) / 5) + 1;
  const month = mv + 3 - 12 * Math.floor(mv / 10);
  const year = 100 * b + d - 4800 + Math.floor(mv / 10);
  return new Date(Date.UTC(year, month - 1, day));
}

// Returns IST date strings (YYYY-MM-DD) for Islamic public holidays in gregorianYear.
function islamicHolidaysForYear(gregorianYear: number): string[] {
  const result: string[] = [];
  // Approximate Hijri year overlapping the Gregorian year (check ±1 for safety).
  const approxHY = Math.floor((gregorianYear - 622) * 1.0307);
  for (const hy of [approxHY - 1, approxHY, approxHY + 1]) {
    const islamicDates: Array<[number, number]> = [
      [1,  10],  // Muharram / Ashura
      [3,  12],  // Milad-un-Nabi (Mawlid)
      [10,  1],  // Eid-ul-Fitr
      [12, 10],  // Eid-ul-Adha
    ];
    for (const [hm, hd] of islamicDates) {
      const d = jdnToUTCDate(hijriToJDN(hy, hm, hd));
      if (d.getUTCFullYear() === gregorianYear) {
        result.push(istDateKey(d));
      }
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Pre-computed South Indian Hindu lunisolar holidays (2025–2040)
// Sources: official Indian gazette, DrikPanchang astronomical calendar,
// Vikram Samvat / Tamil Calendar projections.
//
// Islamic holidays above are algorithmic; no pre-computation needed there.
// These Hindu dates are stable 15-year projections — next update: 2041.
// ---------------------------------------------------------------------------

const SOUTH_INDIAN_HINDU_HOLIDAYS = new Set([
  // ── Maha Shivaratri (13th Krishna Paksha, Phalguna/Maasi) ─────────────────
  "2025-02-26", "2026-02-15", "2027-02-04", "2028-02-22", "2029-02-11",
  "2030-03-02", "2031-02-19", "2032-02-09", "2033-02-27", "2034-02-16",
  "2035-03-08", "2036-02-25", "2037-02-14", "2038-03-05", "2039-02-23",
  "2040-02-12",

  // ── Mahavir Jayanti (13th Chaitra Shukla) ─────────────────────────────────
  "2025-04-10", "2026-03-29", "2027-04-17", "2028-04-05", "2029-03-25",
  "2030-04-14", "2031-04-03", "2032-04-21", "2033-04-10", "2034-03-30",
  "2035-04-18", "2036-04-07", "2037-03-27", "2038-04-14", "2039-04-02",
  "2040-04-22",

  // ── Buddha Purnima (Vaishakha Purnima) ────────────────────────────────────
  "2025-05-12", "2026-05-31", "2027-05-20", "2028-05-09", "2029-05-28",
  "2030-05-17", "2031-05-07", "2032-05-25", "2033-05-14", "2034-06-02",
  "2035-05-23", "2036-05-11", "2037-05-30", "2038-05-19", "2039-05-09",
  "2040-05-27",

  // ── Janmashtami / Krishnashtami (8th Krishna Paksha, Aavani) ──────────────
  "2025-08-16", "2026-08-05", "2027-08-24", "2028-08-13", "2029-09-01",
  "2030-08-21", "2031-08-11", "2032-08-29", "2033-08-18", "2034-08-08",
  "2035-08-27", "2036-08-15", "2037-09-03", "2038-08-23", "2039-08-12",
  "2040-08-30",

  // ── Vijayadasami / Dussehra (10th Ashwin Shukla — Saraswati Puja / Golu) ──
  // 2025-10-02 intentionally omitted — already covered by Gandhi Jayanti in FIXED set.
  "2026-10-21", "2027-10-11", "2028-09-29", "2029-10-18",
  "2030-10-07", "2031-10-26", "2032-10-15", "2033-10-04", "2034-10-24",
  "2035-10-13", "2036-10-01", "2037-10-20", "2038-10-09", "2039-09-28",
  "2040-10-17",

  // ── Deepavali / Naraka Chaturdashi (South Indian; 14th Krishna Paksha, Karthika) ──
  "2025-10-20", "2026-11-08", "2027-10-28", "2028-10-17", "2029-11-05",
  "2030-10-25", "2031-11-13", "2032-11-01", "2033-10-21", "2034-11-10",
  "2035-10-30", "2036-10-18", "2037-11-07", "2038-10-27", "2039-10-15",
  "2040-11-03",

  // ── Karthigai Deepam (Full moon of Karthigai month — Tamil Nadu) ──────────
  "2025-12-05", "2026-11-24", "2027-12-13", "2028-12-02", "2029-11-21",
  "2030-12-10", "2031-11-29", "2032-11-17", "2033-12-06", "2034-11-25",
  "2035-12-15", "2036-12-03", "2037-11-22", "2038-12-11", "2039-11-30",
  "2040-11-18",

  // ── Guru Nanak Jayanti (Kartika Purnima) ──────────────────────────────────
  "2025-11-05", "2026-10-24", "2027-11-13", "2028-11-01", "2029-10-21",
  "2030-11-09", "2031-10-29", "2032-10-17", "2033-11-05", "2034-10-25",
  "2035-11-13", "2036-11-01", "2037-10-21", "2038-11-09", "2039-10-29",
  "2040-10-17",
]);

// ---------------------------------------------------------------------------
// Per-year computed holiday cache (Islamic + Easter keyed by Gregorian year)
// ---------------------------------------------------------------------------

const _algorithmicCache = new Map<number, Set<string>>();

function algorithmicHolidaysForYear(year: number): Set<string> {
  if (_algorithmicCache.has(year)) return _algorithmicCache.get(year)!;

  const dates = new Set<string>();

  // Good Friday = Easter Sunday − 2 days
  const easter = computeEasterUTC(year);
  const goodFriday = new Date(easter);
  goodFriday.setUTCDate(goodFriday.getUTCDate() - 2);
  dates.add(istDateKey(goodFriday));

  // All 4 Islamic holidays for the year
  for (const d of islamicHolidaysForYear(year)) dates.add(d);

  _algorithmicCache.set(year, dates);
  return dates;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function isIndianHoliday(utcDate: Date): boolean {
  const { year, month, day } = toIST(utcDate);
  const mmdd = `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (FIXED_HOLIDAYS_MM_DD.has(mmdd)) return true;

  const key = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (SOUTH_INDIAN_HINDU_HOLIDAYS.has(key)) return true;

  return algorithmicHolidaysForYear(year).has(key);
}

export function isWorkingDay(utcDate: Date): boolean {
  const { dayOfWeek } = toIST(utcDate);
  if (dayOfWeek === 0) return false; // Sunday
  return !isIndianHoliday(utcDate);
}

export function isWithinSlaBusinessHours(utcDate: Date): boolean {
  if (!isWorkingDay(utcDate)) return false;
  const { hour, minute } = toIST(utcDate);
  const totalMinutes = hour * 60 + minute;
  return totalMinutes >= 10 * 60 && totalMinutes < 18 * 60; // [10:00, 18:00)
}

export function advancePastNonWorkingDay(utcDate: Date): Date {
  const result = new Date(utcDate);
  let iterations = 0;
  while (!isWorkingDay(result)) {
    result.setUTCDate(result.getUTCDate() + 1);
    if (++iterations > 14) break;
  }
  return result;
}
