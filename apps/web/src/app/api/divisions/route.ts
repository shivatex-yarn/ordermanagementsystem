import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth, withRole } from "@/lib/with-auth";
import { z } from "zod";

const createDivisionSchema = z.object({ name: z.string().min(1).max(255).trim() });

export async function GET() {
  const auth = await withAuth();
  if (auth.response) return auth.response;
  const divisions = await prisma.division.findMany({
    orderBy: { name: "asc" },
    include: {
      managers: { include: { user: { select: { id: true, name: true, email: true } } } },
    },
  });
  return NextResponse.json({ divisions });
}

/** Super Admin only: create division */
export async function POST(req: Request) {
  const auth = await withRole(["SUPER_ADMIN"]);
  if (auth.response) return auth.response;
  const body = await req.json();
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
    return NextResponse.json({ error: "Division with this name already exists" }, { status: 409 });
  }
  const division = await prisma.division.create({
    data: { name: parsed.data.name },
  });
  return NextResponse.json(division, { status: 201 });
}
