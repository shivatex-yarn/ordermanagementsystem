/** Who may raise a new enquiry (sales only). Division heads (MANAGER) and MD handle enquiries; they do not open new ones here. */
export const ENQUIRY_CREATOR_ROLES = ["USER", "SUPERVISOR"] as const;

export type EnquiryCreatorRole = (typeof ENQUIRY_CREATOR_ROLES)[number];

export function userMayCreateEnquiry(role: string): role is EnquiryCreatorRole {
  return (ENQUIRY_CREATOR_ROLES as readonly string[]).includes(role);
}

/** Super admin and MD — enquiry pipeline strip, per-order activity / detailed timestamps (not for division heads / `MANAGER`). */
export const ENQUIRY_EXEC_INSIGHT_ROLES = ["SUPER_ADMIN", "MANAGING_DIRECTOR"] as const;

export function userMayViewEnquiryExecInsights(role: string | undefined): boolean {
  if (!role) return false;
  return (ENQUIRY_EXEC_INSIGHT_ROLES as readonly string[]).includes(role);
}
