import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { withAuth, withRole } from "@/lib/with-auth";
import { getRoutableDivisionIdsForUser } from "@/lib/division-access";
import { z } from "zod";

const createDivisionSchema = z.object({ name: z.string().min(1).max(255).trim() });

export async function GET(req: Request) {
  try {
    const auth = await withAuth();
    if (auth.response) return auth.response;
    const { searchParams } = new URL(req.url);
    const includeInactive = searchParams.get("includeInactive") === "true" && (auth.payload.role === "SUPER_ADMIN" || auth.payload.role === "MANAGING_DIRECTOR");
    const routingScope = searchParams.get("scope") === "routing";

    const where: Prisma.DivisionWhereInput = includeInactive ? {} : { active: true };

    if (routingScope) {
      if (auth.payload.role !== "SUPER_ADMIN" && auth.payload.role !== "MANAGING_DIRECTOR") {
        const userId = Number(auth.payload.sub);
        const allowed = await getRoutableDivisionIdsForUser(userId);
        if (allowed.length === 0) {
          return NextResponse.json({ divisions: [] });
        }
        where.id = { in: allowed };
      }
    }

    const divisions = await prisma.division.findMany({
      where,
      orderBy: { name: "asc" },
      include: {
        managers: { include: { user: { select: { id: true, name: true, email: true, active: true } } } },
      },
    });
    return NextResponse.json({ divisions });
  } catch (error) {
    console.error("GET /api/divisions failed", error);
    return NextResponse.json({ error: "Failed to load divisions" }, { status: 500 });
  }
}

/** Super Admin only: create division (managed under Admin Panel) */
export async function POST(req: Request) {
  try {
    const auth = await withRole(["SUPER_ADMIN"]);
    if (auth.response) return auth.response;

    const body = await req.json().catch(() => null);
    const parsed = createDivisionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const existing = await prisma.division.findUnique({
      where: { name: parsed.data.name },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Division with this name already exists" },
        { status: 409 }
      );
    }

    const division = await prisma.division.create({
      data: { name: parsed.data.name, active: true },
      select: { id: true, name: true, active: true, createdAt: true, updatedAt: true },
    });

    return NextResponse.json({ division }, { status: 201 });
  } catch (error) {
    console.error("POST /api/divisions failed", error);
    return NextResponse.json({ error: "Failed to create division" }, { status: 500 });
  }
}
