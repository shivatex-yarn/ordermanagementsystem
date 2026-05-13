/** Who may raise a new enquiry (sales-side roles only). Division heads and supervisors handle them; they do not open new ones. */
export const ENQUIRY_CREATOR_ROLES = ["USER", "ASM"] as const;

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
