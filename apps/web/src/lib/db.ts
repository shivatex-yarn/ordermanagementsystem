import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? process.env.PRISMA_LOG_QUERIES === "1"
          ? ["query", "error", "warn"]
          : ["error", "warn"]
        : ["error"],
  });

// Reuse one client per Node process (dev HMR + production warm instances) to avoid connection churn.
globalForPrisma.prisma = prisma;
