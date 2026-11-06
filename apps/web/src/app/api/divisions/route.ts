import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth, withRole } from "@/lib/with-auth";
import { divisionCreateSchema } from "@/lib/validation";

/** Everyone signed in sees the division list (needed to request access). */
export async function GET() {
  const auth = await withAuth();
  if (auth.response) return auth.response;
  const divisions = await prisma.division.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, active: true, _count: { select: { orders: true, users: true } } },
  });
  return NextResponse.json({ divisions });
}

export async function POST(req: Request) {
  const auth = await withRole(["SUPER_ADMIN"]);
  if (auth.response) return auth.response;
  const parsed = divisionCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a division name" }, { status: 400 });
  try {
    const division = await prisma.division.create({ data: { name: parsed.data.name } });
    return NextResponse.json(division, { status: 201 });
  } catch {
    return NextResponse.json({ error: "A division with that name already exists" }, { status: 409 });
  }
}
