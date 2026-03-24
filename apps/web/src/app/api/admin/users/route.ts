import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { withRole } from "@/lib/with-auth";
import { adminCreateUserSchema } from "@/lib/validation";

/** Super Admin and MD (view): list users with division mapping */
export async function GET() {
  try {
    const auth = await withRole(["SUPER_ADMIN", "MANAGING_DIRECTOR"]);
    if (auth.response) return auth.response;
    const users = await prisma.user.findMany({
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        divisionId: true,
        division: { select: { id: true, name: true } },
        managedDivisions: { include: { division: { select: { id: true, name: true } } } },
      },
    });
    return NextResponse.json({
      users: users.map((u) => ({
        ...u,
        managedDivisions: u.managedDivisions?.map((m) => m.division) ?? [],
      })),
    });
  } catch (error) {
    console.error("GET /api/admin/users failed", error);
    return NextResponse.json({ error: "Failed to load users" }, { status: 500 });
  }
}

/** Super Admin only: create user and map to division(s) */
export async function POST(req: Request) {
  try {
    const auth = await withRole(["SUPER_ADMIN"]);
    if (auth.response) return auth.response;
    const body = await req.json();
    const parsed = adminCreateUserSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const existing = await prisma.user.findUnique({
      where: { email: parsed.data.email },
    });
    if (existing) {
      return NextResponse.json({ error: "Email already registered" }, { status: 409 });
    }
    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    const isManager = parsed.data.role === "MANAGER";
    const divisionIds = isManager && parsed.data.divisionIds?.length
      ? parsed.data.divisionIds
      : parsed.data.divisionId
        ? [parsed.data.divisionId]
        : [];
    const divisionId = parsed.data.divisionId ?? (divisionIds[0] ?? null);
    const user = await prisma.user.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        passwordHash,
        role: parsed.data.role,
        divisionId: divisionId ?? undefined,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        divisionId: true,
        division: { select: { id: true, name: true } },
      },
    });
    if (isManager && divisionIds.length > 0) {
      await prisma.divisionManager.createMany({
        data: divisionIds.map((divisionId) => ({ divisionId, userId: user.id })),
        skipDuplicates: true,
      });
    }
    const created = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        divisionId: true,
        division: { select: { id: true, name: true } },
        managedDivisions: { include: { division: { select: { id: true, name: true } } } },
      },
    });
    return NextResponse.json(created ?? user, { status: 201 });
  } catch (error) {
    console.error("POST /api/admin/users failed", error);
    return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
  }
}
