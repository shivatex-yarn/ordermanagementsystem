import { NextResponse } from "next/server";

type PrismaishError = {
  code?: unknown;
  message?: unknown;
};

export function isDbUnavailableError(err: unknown): boolean {
  const code =
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    typeof (err as PrismaishError).code === "string"
      ? String((err as PrismaishError).code)
      : "";
  const message =
    err instanceof Error ? err.message : typeof err === "string" ? err : "";

  // Prisma connection / database errors are typically P10xx.
  if (code.startsWith("P10")) return true;

  // Be defensive: infra/network errors can surface as plain messages.
  return /P1000|P1001|P1002|P1003|P1008|P1011/i.test(message) ||
    /database|connect|connection|timeout|ECONNRESET|ENOTFOUND|EAI_AGAIN/i.test(message);
}

export function dbUnavailableJson(message = "Database unavailable. Please retry.") {
  return NextResponse.json(
    { error: message, code: "DB_UNAVAILABLE" },
    { status: 503, headers: { "Retry-After": "1" } }
  );
}

