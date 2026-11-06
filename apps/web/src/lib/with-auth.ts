import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
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

export async function withRole(
  allowedRoles: Role[]
): Promise<
  { payload: NonNullable<AuthContext>; response?: never } | { payload?: never; response: NextResponse }
> {
  const result = await withAuth();
  if (result.response) return result;
  if (!allowedRoles.includes(result.payload.role)) {
    return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return result;
}

/**
 * Division ids the signed-in person may work in.
 * `null` means every division (Super Admin).
 */
export async function accessibleDivisionIds(payload: { sub: string; role: Role }): Promise<number[] | null> {
  if (payload.role === "SUPER_ADMIN" || payload.role === "MANAGING_DIRECTOR" || payload.role === "ACCOUNTS") return null;
  const rows = await prisma.userDivision.findMany({
    where: { userId: Number(payload.sub) },
    select: { divisionId: true },
  });
  return rows.map((r) => r.divisionId);
}
