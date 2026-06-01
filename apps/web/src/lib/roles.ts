/**
 * Centralised role predicates for the Enquiry Management Application.
 *
 * The spec calls out seven roles; in the database we keep the existing Role enum and
 * add DIVISION_HEAD and ASM. The mapping is:
 *
 *   Spec name        →  Role enum value
 *   ---------------- ----------------------
 *   Admin            →  SUPER_ADMIN
 *   Managing Director→  MANAGING_DIRECTOR
 *   Accounts Team    →  ACCOUNTS
 *   Division Head    →  DIVISION_HEAD (preferred) or MANAGER (legacy)
 *   Supervisor       →  SUPERVISOR
 *   ASM              →  ASM
 *   Salesperson      →  USER
 *
 * MANAGER is kept as a legacy alias for DIVISION_HEAD so old rows keep working.
 */

import type { Role } from "@prisma/client";

export const SUPER_ADMIN: Role = "SUPER_ADMIN";
export const MANAGING_DIRECTOR: Role = "MANAGING_DIRECTOR";
export const DIVISION_HEAD: Role = "DIVISION_HEAD";
export const MANAGER: Role = "MANAGER";
export const SUPERVISOR: Role = "SUPERVISOR";
export const ASM: Role = "ASM";
export const ACCOUNTS: Role = "ACCOUNTS";
export const USER: Role = "USER";

export function isAdmin(role: Role | undefined | null): boolean {
  return role === "SUPER_ADMIN";
}

export function isMD(role: Role | undefined | null): boolean {
  return role === "MANAGING_DIRECTOR";
}

export function isAccounts(role: Role | undefined | null): boolean {
  return role === "ACCOUNTS";
}

/** Division head — DIVISION_HEAD plus legacy MANAGER. */
export function isDivisionHead(role: Role | undefined | null): boolean {
  return role === "DIVISION_HEAD" || role === "MANAGER";
}

export function isSupervisor(role: Role | undefined | null): boolean {
  return role === "SUPERVISOR";
}

export function isASM(role: Role | undefined | null): boolean {
  return role === "ASM";
}

export function isSalesperson(role: Role | undefined | null): boolean {
  return role === "USER";
}

/** Executive view — MD + Admin only. Used for SLA breach overview, escalation alerts. */
export function isExecutive(role: Role | undefined | null): boolean {
  return role === "SUPER_ADMIN" || role === "MANAGING_DIRECTOR";
}

/** Can see customer feedback. Spec: Department/Division Head + higher mgmt only. */
export function canViewCustomerFeedback(role: Role | undefined | null): boolean {
  if (!role) return false;
  return (
    role === "SUPER_ADMIN" ||
    role === "MANAGING_DIRECTOR" ||
    role === "ACCOUNTS" ||
    role === "DIVISION_HEAD" ||
    role === "MANAGER"
  );
}

/** Read-only access for Supervisor / ASM within their division. */
export function isDivisionObserver(role: Role | undefined | null): boolean {
  return role === "SUPERVISOR" || role === "ASM";
}

/** Salesperson alias. */
export function isCreatorRole(role: Role | undefined | null): boolean {
  return role === "USER";
}

/** Routes whose dashboard the user lands on after login. */
export function defaultLandingPath(role: Role | undefined | null): string {
  if (role === "MANAGING_DIRECTOR") return "/md";
  if (role === "ACCOUNTS") return "/accounts";
  if (role === "SUPER_ADMIN") return "/admin/dashboard";
  return "/dashboard";
}

/** Human display label for a role chip. */
export function roleLabel(role: Role | undefined | null): string {
  switch (role) {
    case "SUPER_ADMIN":
      return "Admin";
    case "MANAGING_DIRECTOR":
      return "Managing Director";
    case "ACCOUNTS":
      return "Accounts";
    case "DIVISION_HEAD":
      return "Division Head";
    case "MANAGER":
      return "Unit Head";
    case "SUPERVISOR":
      return "Production";
    case "ASM":
      return "ASM";
    case "USER":
      return "Marketing / Sales";
    default:
      return "Unknown";
  }
}
