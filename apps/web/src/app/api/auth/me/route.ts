import { NextResponse, after } from "next/server";
import { runInactivityCheckIfDue } from "@/lib/inactivity";
import { runWeeklyReportIfDue } from "@/lib/weekly-report";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";

export async function GET() {
  try {
    const auth = await withAuth();
    if (auth.response) return auth.response;

    const userId = Number(auth.payload.sub);
    if (!Number.isInteger(userId) || userId < 1) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        employeeCode: true,
        phone: true,
        role: true,
        active: true,
        divisions: { select: { division: { select: { id: true, name: true } } } },
      },
    });
    if (!user || !user.active) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    after(() => runInactivityCheckIfDue()); // daily 10:30 IST check, runs once, after the response
    after(() => runWeeklyReportIfDue()); // Monday 10:00 IST weekly report, sent once
    const { divisions, ...rest } = user;
    const list = rest.role !== "MARKETING" && rest.role !== "SALES"
      ? await prisma.division.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } })
      : divisions.map((d) => d.division);
    return NextResponse.json({ user: { ...rest, divisions: list } });
  } catch (err) {
    console.error("[api/auth/me]", err);
    return NextResponse.json({ error: "Failed to load session", code: "DB_UNAVAILABLE" }, { status: 503 });
  }
}
