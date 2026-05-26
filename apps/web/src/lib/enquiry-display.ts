/** Show legacy `ORD-` references as `Enq-` in UI and exports. */
export function formatEnquiryNumber(orderNumber: string): string {
  return orderNumber.startsWith("ORD-") ? `Enq-${orderNumber.slice(4)}` : orderNumber;
}

/**
 * Compact display: `Enq-` + last 4 digits of the numeric segment
 * (e.g. `Enq-1779705118883-xu05ea1` → `Enq-8883`).
 * Unique enough for human context; the full number is always linked for exact lookup.
 */
export function formatEnquiryNumberShort(orderNumber: string): string {
  const full = formatEnquiryNumber(orderNumber);
  const parts = full.split("-");
  if (parts.length >= 2) {
    const seg = parts[1];
    if (/^\d{4,}$/.test(seg)) {
      return `Enq-${seg.slice(-4)}`;
    }
  }
  const digits = full.replace(/\D/g, "");
  if (digits.length >= 4) {
    return `Enq-${digits.slice(-4)}`;
  }
  return full;
}
