import Redis from "ioredis";

const getRedisUrl = () => process.env.REDIS_URL || "redis://localhost:6379";

let redis: Redis | null = null;

export function getRedis(): Redis | null {
  if (!process.env.REDIS_URL) return null;
  if (!redis) {
    try {
      redis = new Redis(getRedisUrl(), {
        maxRetriesPerRequest: 3,
        lazyConnect: true,
      });
    } catch {
      return null;
    }
  }
  return redis;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const client = getRedis();
  if (!client) return null;
  try {
    const raw = await client.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds = 300
): Promise<void> {
  const client = getRedis();
  if (!client) return;
  try {
    await client.setex(key, ttlSeconds, JSON.stringify(value));
  } catch {
    // ignore
  }
}

export async function cacheDel(key: string): Promise<void> {
  const client = getRedis();
  if (!client) return;
  try {
    await client.del(key);
  } catch {
    // ignore
  }
}

export function cacheKeyOrdersList(filters: string): string {
  return `oms:orders:list:${filters}`;
}

/** Bump version when order JSON shape changes (avoids stale Redis missing new columns). */
export function cacheKeyOrder(id: number): string {
  return `oms:order:v3:${id}`;
}

export function cacheKeyUser(id: number): string {
  return `oms:user:${id}`;
}
