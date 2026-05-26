import { PrismaClient, Prisma } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

function makePrisma() {
  const logLevels: Prisma.LogLevel[] = process.env.PRISMA_LOG_QUERIES === "1"
    ? ["query", "warn"]
    : ["warn"];
  const client = new PrismaClient({
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
