import { Prisma, PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

/**
 * Neon's pooler aggressively closes idle connections — Prisma surfaces these as P1001
 * ("Can't reach database server") or P1017 ("Server has closed the connection"). The
 * very next query usually succeeds because Prisma reconnects under the hood, so we
 * wrap every operation with a single transparent retry. This eliminates the user-visible
 * stack traces in `next dev` after the pooler reaps idle sessions.
 */
const TRANSIENT_CODES = new Set(["P1001", "P1002", "P1008", "P1017", "P2024"]);

function isTransient(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return TRANSIENT_CODES.has(err.code);
  }
  if (err instanceof Prisma.PrismaClientInitializationError) return true;
  if (err instanceof Prisma.PrismaClientRustPanicError) return false;
  const msg = err instanceof Error ? err.message : String(err);
  return /closed|terminating|reset by peer|ECONNRESET|ETIMEDOUT|Can't reach database/i.test(msg);
}

function buildClient(): PrismaClient {
  /**
   * In development we prefer the direct (non-pooler) URL when available, because:
   *   • `next dev` keeps one long-running Node process — no benefit from a transaction pooler.
   *   • Neon's pooler aggressively closes idle connections, producing scary stderr noise.
   *   • A direct connection is measurably faster for a single dev session.
   * In production we leave `DATABASE_URL` (pooler) untouched.
   */
  const datasourceUrl =
    process.env.NODE_ENV !== "production" && process.env.DIRECT_DATABASE_URL
      ? process.env.DIRECT_DATABASE_URL
      : undefined;

  const base = new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? process.env.PRISMA_LOG_QUERIES === "1"
          ? ["query", "error", "warn"]
          : ["error", "warn"]
        : ["error"],
    ...(datasourceUrl ? { datasources: { db: { url: datasourceUrl } } } : {}),
  });

  // Type-cast `as PrismaClient` because $extends returns a stricter generic — the public
  // surface we use (`prisma.order.findMany` etc.) is identical and any extra type info
  // would force every callsite to update generics.
  return base.$extends({
    query: {
      $allOperations: async ({ args, query }) => {
        try {
          return await query(args);
        } catch (err) {
          if (!isTransient(err)) throw err;
          // Wait briefly for the pooler to recycle the session, then retry once.
          await new Promise((r) => setTimeout(r, 200));
          return query(args);
        }
      },
    },
  }) as unknown as PrismaClient;
}

export const prisma = globalForPrisma.prisma ?? buildClient();

// Reuse one client per Node process (dev HMR + production warm instances) to avoid connection churn.
globalForPrisma.prisma = prisma;

/**
 * Swallow Prisma's internal "Error in PostgreSQL connection: ... kind: Closed" noise.
 * The retry layer above re-runs the query and the request succeeds — these console
 * messages just confuse users into thinking the app is broken. Real errors (query
 * failures, validation, etc.) still surface normally.
 */
if (typeof globalThis !== "undefined" && !(globalThis as { __prismaStderrFiltered?: boolean }).__prismaStderrFiltered) {
  (globalThis as { __prismaStderrFiltered?: boolean }).__prismaStderrFiltered = true;
  const realError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    const first = args[0];
    if (typeof first === "string" && /Error in PostgreSQL connection.*kind: Closed/.test(first)) {
      return; // benign — retry handler dealt with it
    }
    realError(...args);
  };
}
