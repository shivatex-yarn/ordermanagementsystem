/**
 * Audit trail + in-app notifications. Both are best-effort: a failure here must never break the action itself.
 */
import { prisma } from "@/lib/db";

export type AuditCategory = "AUTH" | "ENQUIRY" | "TEAM" | "DIVISION" | "ACCESS";

type Actor = { sub: string; role?: string } | null;

function ipOf(req?: Request): string | null {
  if (!req) return null;
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip")?.trim() || null;
}

/** "Chrome on Mac" from a raw user-agent string. */
export function describeDevice(ua: string | null | undefined): string | null {
  if (!ua) return null;
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "unknown device";
  return `${browser} on ${os}`;
}

export async function logAudit(input: {
  actor: Actor;
  /** Used when there is no signed-in actor (e.g. a failed login). */
  fallbackName?: string;
  action: string;
  category: AuditCategory;
  entityType?: string;
  entityId?: number;
  entityLabel?: string;
  detail?: string | null;
  req?: Request;
}): Promise<void> {
  try {
    const userId = input.actor ? Number(input.actor.sub) : null;
    const user = userId ? await prisma.user.findUnique({ where: { id: userId }, select: { name: true, role: true } }) : null;
    await prisma.auditLog.create({
      data: {
        userId: user ? userId : null,
        userName: user?.name ?? input.fallbackName ?? (input.actor ? "Deleted user" : "Unknown"),
        userRole: user?.role ?? input.actor?.role ?? null,
        category: input.category,
        action: input.action,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        entityLabel: input.entityLabel ?? null,
        detail: input.detail ?? null,
        ipAddress: ipOf(input.req),
      },
    });
  } catch (err) {
    console.error("[audit] failed to record", input.action, err);
  }
}

export async function notify(
  userIds: (number | null | undefined)[],
  n: { type: string; title: string; body: string; link?: string },
  exceptUserId?: number
): Promise<void> {
  try {
    const ids = [...new Set(userIds.filter((x): x is number => !!x && x !== exceptUserId))];
    if (!ids.length) return;
    await prisma.notification.createMany({ data: ids.map((userId) => ({ userId, type: n.type, title: n.title, body: n.body, link: n.link ?? null })) });
  } catch (err) {
    console.error("[notify] failed", n.type, err);
  }
}

/** Active Sales people mapped to a division. */
export async function salesInDivision(divisionId: number): Promise<number[]> {
  const rows = await prisma.user.findMany({
    where: { role: "SALES", active: true, divisions: { some: { divisionId } } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

export async function superAdminIds(): Promise<number[]> {
  const rows = await prisma.user.findMany({ where: { role: "SUPER_ADMIN", active: true }, select: { id: true } });
  return rows.map((r) => r.id);
}
