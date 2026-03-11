/**
 * In-memory rate limiter for API routes.
 * For production at scale, use Redis-based limiter (e.g. @upstash/ratelimit).
 */

const store = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 100; // per minute per identifier

function cleanup(): void {
  const now = Date.now();
  for (const [key, v] of store.entries()) {
    if (v.resetAt < now) store.delete(key);
  }
}

export function rateLimit(identifier: string): { ok: boolean; remaining: number } {
  cleanup();
  const now = Date.now();
  const entry = store.get(identifier);
  if (!entry) {
    store.set(identifier, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true, remaining: MAX_REQUESTS - 1 };
  }
  if (entry.resetAt < now) {
    entry.count = 1;
    entry.resetAt = now + WINDOW_MS;
    return { ok: true, remaining: MAX_REQUESTS - 1 };
  }
  entry.count += 1;
  const remaining = Math.max(0, MAX_REQUESTS - entry.count);
  return { ok: entry.count <= MAX_REQUESTS, remaining };
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
