/** Short labels for enquiry notifications (UI + stored titles). */
export const NOTIFICATION_SHORT_LABELS: Record<string, string> = {
  OrderCreated: "New enquiry",
  OrderAccepted: "Accepted",
  OrderTransferred: "Transferred",
  OrderRejected: "Rejected",
  OrderCancelled: "Cancelled by submitter",
  OrderReceived: "Received",
  OrderCompleted: "Completed",
  SLABreachDetected: "SLA alert",
  SampleDetailsUpdated: "Sample details",
  SampleApproved: "Sample approved",
  SampleShipped: "Sample shipped",
  SalesFeedbackRecorded: "Sales feedback",
};

export function getNotificationShortLabel(type: string): string {
  return NOTIFICATION_SHORT_LABELS[type] ?? type.replace(/^Order/i, "Enquiry ");
}
