import { prisma } from "@/lib/db";

/** Primary division + division_manager rows — divisions this user may route new enquiries to. */
export async function getRoutableDivisionIdsForUser(userId: number): Promise<number[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { divisionId: true },
  });
  const managed = await prisma.divisionManager.findMany({
    where: { userId },
    select: { divisionId: true },
  });
  return Array.from(
    new Set(
      [user?.divisionId ?? null, ...managed.map((m) => m.divisionId)].filter((v): v is number => typeof v === "number")
    )
  );
}

export async function userMayRouteEnquiryToDivision(
  userId: number,
  role: string,
  divisionId: number
): Promise<boolean> {
  if (role === "SUPER_ADMIN") return true;
  /**
   * GET /api/divisions?scope=routing lists every active division for MD (same as super admin),
   * but MD often has no `user.divisionId` / division_manager rows — so `getRoutableDivisionIdsForUser`
   * is empty and POST would incorrectly reject. Align POST with that list: any active division.
   */
  if (role === "MANAGING_DIRECTOR") {
    const d = await prisma.division.findFirst({
      where: { id: divisionId, active: true },
      select: { id: true },
    });
    return d != null;
  }
  const allowed = await getRoutableDivisionIdsForUser(userId);
  return allowed.includes(divisionId);
}
