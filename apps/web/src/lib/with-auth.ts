import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { Role } from "@prisma/client";

export type AuthContext = Awaited<ReturnType<typeof getSession>>;

export async function withAuth(): Promise<
  { payload: NonNullable<AuthContext>; response?: never } | { payload?: never; response: NextResponse }
> {
  const payload = await getSession();
  if (!payload) {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { payload };
}

const roleHierarchy: Record<Role, number> = {
  USER: 0,
  SUPERVISOR: 1,
  MANAGER: 2,
  SUPER_ADMIN: 3,
};

export function hasRole(userRole: Role, required: Role): boolean {
  return roleHierarchy[userRole] >= roleHierarchy[required];
}

export async function withRole(
  allowedRoles: Role[]
): Promise<
  { payload: NonNullable<AuthContext>; response?: never } | { payload?: never; response: NextResponse }
> {
  const result = await withAuth();
  if (result.response) return result;
  const allowed = new Set(allowedRoles);
  if (!allowed.has(result.payload.role)) {
    return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return result;
}
