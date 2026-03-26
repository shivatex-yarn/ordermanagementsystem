/** Show legacy `ORD-` references as `Enq-` in UI and exports. */
export function formatEnquiryNumber(orderNumber: string): string {
  return orderNumber.startsWith("ORD-") ? `Enq-${orderNumber.slice(4)}` : orderNumber;
}
