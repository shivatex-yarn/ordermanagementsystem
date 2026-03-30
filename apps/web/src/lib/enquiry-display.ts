/** Show legacy `ORD-` references as `Enq-` in UI and exports. */
export function formatEnquiryNumber(orderNumber: string): string {
  return orderNumber.startsWith("ORD-") ? `Enq-${orderNumber.slice(4)}` : orderNumber;
}

/**
 * Compact header display: `Enq-` + last 5 digits of the numeric segment
 * (e.g. `Enq-1774851450513-dmhoewd` → `Enq-50513`). Falls back sensibly if the pattern differs.
 */
export function formatEnquiryNumberShort(orderNumber: string): string {
  const full = formatEnquiryNumber(orderNumber);
  const parts = full.split("-");
  if (parts.length >= 2) {
    const seg = parts[1];
    if (/^\d{5,}$/.test(seg)) {
      return `Enq-${seg.slice(-5)}`;
    }
  }
  const digits = full.replace(/\D/g, "");
  if (digits.length >= 5) {
    return `Enq-${digits.slice(-5)}`;
  }
  return full;
}
