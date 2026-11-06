/**
 * Role helpers. Three roles only:
 *   SUPER_ADMIN — adds team members, maps them to divisions, approves division access
 *   MANAGING_DIRECTOR / ACCOUNTS — read-only overview of every enquiry
 *   MARKETING   — logs enquiries
 *   SALES       — adds pricing, sample details and client feedback
 */
import type { Role } from "@prisma/client";

export const isAdmin = (r?: Role | null) => r === "SUPER_ADMIN";
export const isMarketing = (r?: Role | null) => r === "MARKETING";
export const isMD = (r?: Role | null) => r === "MANAGING_DIRECTOR";
export const isAccounts = (r?: Role | null) => r === "ACCOUNTS";
/** Read-only people who see every division. */
export const isViewer = (r?: Role | null) => r === "MANAGING_DIRECTOR" || r === "ACCOUNTS";
export const isSales = (r?: Role | null) => r === "SALES";

/** Who may log a new enquiry. */
export const canCreateEnquiry = (r?: Role | null) => r === "MARKETING" || r === "SUPER_ADMIN";
/** Who may add pricing, sample details and client feedback. */
export const canPrice = (r?: Role | null) => r === "SALES" || r === "SUPER_ADMIN";

export function defaultLandingPath(role?: Role | null): string {
  if (role === "ACCOUNTS") return "/accounts";
  if (role === "MANAGING_DIRECTOR") return "/md";
  return role === "SUPER_ADMIN" ? "/overview" : "/dashboard";
}

export function roleLabel(role?: Role | null): string {
  switch (role) {
    case "SUPER_ADMIN":
      return "Super admin";
    case "MANAGING_DIRECTOR":
      return "Managing director";
    case "ACCOUNTS":
      return "Accounts";
    case "MARKETING":
      return "Marketing";
    case "SALES":
      return "Sales";
    default:
      return "Unknown";
  }
}

export const ASSIGNABLE_ROLES: { value: Role; label: string }[] = [
  { value: "MARKETING", label: "Marketing" },
  { value: "SALES", label: "Sales" },
  { value: "MANAGING_DIRECTOR", label: "Managing director" },
  { value: "ACCOUNTS", label: "Accounts" },
];
