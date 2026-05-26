import { PrismaClient, Prisma } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

/**
 * Build an optimized DATABASE_URL for Neon serverless + PgBouncer pooler.
 *
 * Key parameters injected (only if not already present in the env URL):
 *   connection_limit=1   — one connection per serverless instance avoids pool exhaustion
 *   pool_timeout=10      — fail fast instead of queuing for a free connection
 *   connect_timeout=10   — abort TCP handshake in 10 s instead of the default 30 s
 *   pgbouncer=true       — tells Prisma to skip the prepared-statement protocol that
 *                          PgBouncer doesn't support in transaction mode
 *
 * If DATABASE_URL is not set or is malformed the raw value is returned unchanged.
 */
function buildDatabaseUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (!url) return url;
  try {
    const u = new URL(url);
    if (!u.searchParams.has("connection_limit")) u.searchParams.set("connection_limit", "1");
    if (!u.searchParams.has("pool_timeout"))     u.searchParams.set("pool_timeout", "10");
    if (!u.searchParams.has("connect_timeout"))  u.searchParams.set("connect_timeout", "10");
    if (!u.searchParams.has("pgbouncer"))        u.searchParams.set("pgbouncer", "true");
    return u.toString();
  } catch {
    return url; // not a valid URL (e.g. unix socket path) — leave as-is
  }
}

function makePrisma() {
  const logLevels: Prisma.LogLevel[] = process.env.PRISMA_LOG_QUERIES === "1"
    ? ["query", "warn"]
    : ["warn"];
  const client = new PrismaClient({
    datasourceUrl: buildDatabaseUrl(),
    log: [
      ...logLevels.map((level) => ({ emit: "stdout" as const, level })),
      // Route error events through a handler so we can suppress Neon TCP-reset noise.
      { emit: "event" as const, level: "error" },
    ],
  });
  // Neon serverless pool resets idle connections with "kind: Closed, cause: None".
  // These are harmless reconnects logged as errors by the Rust query engine.
  // We suppress them to keep logs readable; real DB errors are rethrown by Prisma anyway.
  client.$on("error", (e: Prisma.LogEvent) => {
    if (e.message?.includes("kind: Closed")) return;
    console.error("[prisma]", e.message);
  });
  return client;
}

export const prisma = globalForPrisma.prisma ?? makePrisma();

// Reuse one client per Node process (dev HMR + production warm instances).
globalForPrisma.prisma = prisma;
