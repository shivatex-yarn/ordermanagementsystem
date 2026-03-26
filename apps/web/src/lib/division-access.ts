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
  const allowed = await getRoutableDivisionIdsForUser(userId);
  return allowed.includes(divisionId);
}
