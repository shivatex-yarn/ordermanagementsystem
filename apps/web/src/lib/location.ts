/**
 * Best-effort city extraction from the free-text `customerAddress` field.
 *
 * There is no city column on Order — addresses are captured as one block of
 * text — so the dashboard derives a location from the last meaningful comma
 * segment. Anything we cannot read is reported as "Not specified" rather than
 * guessed, so the chart never invents a place that isn't in the data.
 */
const PIN_OR_NUMBER = /^[\d\s-]+$/;
const COUNTRY_WORDS = new Set([
  "india",
  "bharat",
  "in",
  "uae",
  "usa",
  "us",
  "uk",
  "singapore",
  "bangladesh",
  "sri lanka",
]);

export const UNKNOWN_LOCATION = "Not specified";

export function cityFromAddress(address: string | null | undefined): string {
  if (!address) return UNKNOWN_LOCATION;

  const parts = address
    .split(/[,\n]/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return UNKNOWN_LOCATION;

  // Walk backwards past the country and any pincode until we hit a place name.
  for (let i = parts.length - 1; i >= 0; i--) {
    const raw = parts[i];
    const cleaned = raw.replace(/\b\d{6}\b/g, "").replace(/\s+/g, " ").trim();
    if (!cleaned) continue;
    if (PIN_OR_NUMBER.test(cleaned)) continue;
    if (COUNTRY_WORDS.has(cleaned.toLowerCase())) continue;
    if (cleaned.length < 2) continue;
    return titleCase(townFromLine(cleaned));
  }
  return UNKNOWN_LOCATION;
}

/**
 * Many addresses are written as one line — "Chinna Andan Kovil Road Karur" —
 * with the town tacked on after the street. When a line contains a street word,
 * take what follows it; that is the town far more often than not.
 */
const STREET_WORDS =
  /\b(road|rd|street|st|nagar|cross|main|layout|colony|lane|avenue|extension|post|village|taluk)\b/i;

function townFromLine(line: string): string {
  const match = STREET_WORDS.exec(line);
  if (!match) return line;
  const tail = line.slice(match.index + match[0].length).trim();
  if (tail.length >= 2) return tail;
  // Street word sits at the end — the word before it is the best we have.
  const head = line.slice(0, match.index).trim().split(" ");
  return head.length > 1 ? head[head.length - 1] : line;
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(" ")
    .map((w) => (w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w.toUpperCase()))
    .join(" ");
}
