/**
 * In-memory per-process rate limiting (sufficient for typical serverless single-region usage).
 */

const WINDOW_SEC = 60;
const MAX_REQUESTS_DEFAULT = 200;

const memoryStore = new Map<string, { count: number; resetAt: number }>();

function cleanupMemory(): void {
  const now = Date.now();
  for (const [key, v] of memoryStore.entries()) {
    if (v.resetAt < now) memoryStore.delete(key);
  }
}

function rateLimitMemory(identifier: string, maxRequests: number): { ok: boolean; remaining: number } {
  cleanupMemory();
  const now = Date.now();
  const windowMs = WINDOW_SEC * 1000;
  const entry = memoryStore.get(identifier);
  if (!entry) {
    memoryStore.set(identifier, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: maxRequests - 1 };
  }
  if (entry.resetAt < now) {
    entry.count = 1;
    entry.resetAt = now + windowMs;
    return { ok: true, remaining: maxRequests - 1 };
  }
  entry.count += 1;
  const remaining = Math.max(0, maxRequests - entry.count);
  return { ok: entry.count <= maxRequests, remaining };
}

export async function rateLimit(
  identifier: string,
  maxRequests: number = MAX_REQUESTS_DEFAULT
): Promise<{ ok: boolean; remaining: number }> {
  return rateLimitMemory(identifier, maxRequests);
}

export function getRateLimitIdentifier(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : "unknown";
  const auth = req.headers.get("authorization");
  if (auth) {
    const token = auth.replace(/^Bearer\s+/i, "").slice(0, 20);
    return `auth:${token}`;
  }
  return `ip:${ip}`;
}

/** Prefer after auth so limits are per-user, not shared by NAT IP. */
export function getRateLimitIdentifierForUser(req: Request, userId: number): string {
  const base = getRateLimitIdentifier(req);
  return `user:${userId}:${base}`;
}
