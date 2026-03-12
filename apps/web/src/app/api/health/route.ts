import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getRedis } from "@/lib/redis";

export async function GET() {
  const checks: Record<string, string> = {};
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "ok";
  } catch {
    checks.database = "error";
  }
  const redis = getRedis();
  if (redis) {
    try {
      await redis.ping();
      checks.redis = "ok";
    } catch {
      checks.redis = "error";
    }
  } else {
    checks.redis = "skipped";
  }
  const healthy = Object.values(checks).every((v) => v === "ok" || v === "skipped");
  return NextResponse.json(
    { status: healthy ? "healthy" : "degraded", checks },
    { status: healthy ? 200 : 503 }
  );
}
