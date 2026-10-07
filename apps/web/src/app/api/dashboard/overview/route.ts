import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { buildOrderScope } from "@/lib/order-scope";
import { cityFromAddress, UNKNOWN_LOCATION } from "@/lib/location";
import { buildQueues } from "@/lib/dashboard-queues";

export const dynamic = "force-dynamic";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Everything the role dashboards draw, in one request.
 *
 * Two things matter here:
 *
 *  - Scope. Aggregates use `buildOrderScope`, the same visibility rule the
 *    enquiry list uses, so the headline numbers always describe exactly the
 *    enquiries the signed-in person is allowed to open.
 *
 *  - Connections. The Neon pooler gives each instance a single connection
 *    (`connection_limit=1`), so every query below runs one after another.
 *    A `Promise.all` here exhausts the pool and times out — do not add one.
 */
export async function GET() {
  const auth = await withAuth();
  if (auth.response) return auth.response;

  const role = auth.payload.role;
  const userId = Number(auth.payload.sub);

  try {
    const scope = await buildOrderScope(auth.payload);

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const windowStart = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - 7);

    // ── 1. Status mix, and every total derived from it ──────────────────
    const statusGroups = await prisma.order.groupBy({
      by: ["status"],
      where: scope,
      _count: { _all: true },
    });
    const counts = Object.fromEntries(
      statusGroups.map((g) => [g.status, g._count._all])
    ) as Record<string, number>;
    const total = statusGroups.reduce((sum, g) => sum + g._count._all, 0);

    // ── 2. Twelve-month window: volume, plus this week / this month ─────
    const windowRows = await prisma.order.findMany({
      where: { ...scope, createdAt: { gte: windowStart } },
      select: { createdAt: true, completedAt: true },
    });

    const monthKeys: { key: string; label: string; year: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthKeys.push({
        key: `${d.getFullYear()}-${d.getMonth()}`,
        label: MONTHS[d.getMonth()],
        year: d.getFullYear(),
      });
    }
    const monthIndex = new Map(monthKeys.map((m, i) => [m.key, i]));
    const monthly = monthKeys.map((m) => ({
      month: m.label,
      year: m.year,
      submitted: 0,
      completed: 0,
    }));

    let createdThisWeek = 0;
    let completedThisWeek = 0;
    let thisMonth = 0;
    for (const row of windowRows) {
      const ci = monthIndex.get(`${row.createdAt.getFullYear()}-${row.createdAt.getMonth()}`);
      if (ci != null) monthly[ci].submitted += 1;
      if (row.createdAt >= weekStart) createdThisWeek += 1;
      if (row.createdAt >= monthStart) thisMonth += 1;
      if (row.completedAt) {
        const di = monthIndex.get(
          `${row.completedAt.getFullYear()}-${row.completedAt.getMonth()}`
        );
        if (di != null) monthly[di].completed += 1;
        if (row.completedAt >= weekStart) completedThisWeek += 1;
      }
    }

    // ── 3. Division load ────────────────────────────────────────────────
    const divisionGroups = await prisma.order.groupBy({
      by: ["currentDivisionId"],
      where: scope,
      _count: { _all: true },
    });
    const divisionIds = divisionGroups.map((g) => g.currentDivisionId);
    const divisions = divisionIds.length
      ? await prisma.division.findMany({
          where: { id: { in: divisionIds } },
          select: { id: true, name: true },
        })
      : [];
    const divisionName = new Map(divisions.map((d) => [d.id, d.name]));
    const byDivision = divisionGroups
      .map((g) => ({
        name: divisionName.get(g.currentDivisionId) ?? "Unassigned",
        count: g._count._all,
      }))
      .sort((a, b) => b.count - a.count);

    // ── 4. Customers by city, read out of the address text ──────────────
    const locationRows = await prisma.order.findMany({
      where: scope,
      select: { customerAddress: true },
      take: 2000,
      orderBy: { createdAt: "desc" },
    });
    const cityTally = new Map<string, number>();
    for (const row of locationRows) {
      const city = cityFromAddress(row.customerAddress);
      cityTally.set(city, (cityTally.get(city) ?? 0) + 1);
    }
    const namedCities = Array.from(cityTally.entries())
      .filter(([name]) => name !== UNKNOWN_LOCATION)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
    const byCity = namedCities.slice(0, 7);
    const otherCities = namedCities.slice(7).reduce((s, c) => s + c.count, 0);
    if (otherCities > 0) byCity.push({ name: "Other", count: otherCities });
    const unknownCity = cityTally.get(UNKNOWN_LOCATION) ?? 0;

    // ── 5. Deadlines: the calendar and the overdue count ────────────────
    const deadlineRows = await prisma.order.findMany({
      where: {
        ...scope,
        status: { in: ["PLACED", "IN_PROGRESS", "TRANSFERRED"] },
        slaDeadline: { not: null },
      },
      select: { slaDeadline: true },
      orderBy: { slaDeadline: "asc" },
      take: 500,
    });
    const calendar: Record<string, { due: number; overdue: number }> = {};
    let overdue = 0;
    for (const row of deadlineRows) {
      const d = row.slaDeadline;
      if (!d) continue;
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate()
      ).padStart(2, "0")}`;
      const cell = (calendar[k] ??= { due: 0, overdue: 0 });
      cell.due += 1;
      if (d < now) {
        cell.overdue += 1;
        overdue += 1;
      }
    }

    // ── 6. Top people ───────────────────────────────────────────────────
    const topAgents = await buildTopAgents(scope, role);

    // ── 7. The work queues ──────────────────────────────────────────────
    const { needsYou, waitingOn } = await buildQueues(role, userId, scope, now);

    return NextResponse.json({
      generatedAt: now.toISOString(),
      totals: {
        total,
        open: (counts.PLACED ?? 0) + (counts.IN_PROGRESS ?? 0) + (counts.TRANSFERRED ?? 0),
        placed: counts.PLACED ?? 0,
        inProgress: counts.IN_PROGRESS ?? 0,
        transferred: counts.TRANSFERRED ?? 0,
        completed: counts.COMPLETED ?? 0,
        rejected: counts.REJECTED ?? 0,
        cancelled: counts.CANCELLED ?? 0,
        overdue,
        createdThisWeek,
        completedThisWeek,
        thisMonth,
      },
      monthly,
      statusSplit: [
        { key: "PLACED", label: "Awaiting acceptance", count: counts.PLACED ?? 0 },
        { key: "IN_PROGRESS", label: "In progress", count: counts.IN_PROGRESS ?? 0 },
        { key: "TRANSFERRED", label: "Transferred", count: counts.TRANSFERRED ?? 0 },
        { key: "COMPLETED", label: "Completed", count: counts.COMPLETED ?? 0 },
        { key: "REJECTED", label: "Rejected", count: counts.REJECTED ?? 0 },
        { key: "CANCELLED", label: "Cancelled", count: counts.CANCELLED ?? 0 },
      ].filter((s) => s.count > 0),
      byDivision,
      byCity,
      unknownCity,
      calendar,
      topAgents,
      needsYou: needsYou.slice(0, 6),
      waitingOn: waitingOn.slice(0, 6),
      needsYouTotal: needsYou.length,
      waitingOnTotal: waitingOn.length,
    });
  } catch (err) {
    console.error("[GET /api/dashboard/overview]", err);
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2022") {
      return NextResponse.json(
        { error: "Database schema is out of date. Run: npx prisma migrate deploy", code: "SCHEMA_DRIFT" },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "Failed to load dashboard" }, { status: 500 });
  }
}

/**
 * The people moving the most work, within whatever the viewer can see.
 * A salesperson only sees their own enquiries, so a leaderboard is noise.
 */
async function buildTopAgents(scope: Prisma.OrderWhereInput, role: string) {
  if (role === "USER") return [];

  const submitted = await prisma.order.groupBy({
    by: ["createdById"],
    where: scope,
    _count: { _all: true },
    orderBy: { _count: { createdById: "desc" } },
    take: 8,
  });
  if (submitted.length === 0) return [];

  const ids = submitted.map((s) => s.createdById);
  const people = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, role: true, division: { select: { name: true } } },
  });
  const completedGroups = await prisma.order.groupBy({
    by: ["createdById"],
    where: { ...scope, createdById: { in: ids }, status: "COMPLETED" },
    _count: { _all: true },
  });

  const personById = new Map(people.map((p) => [p.id, p]));
  const completedById = new Map(completedGroups.map((g) => [g.createdById, g._count._all]));

  return submitted
    .map((s) => {
      const person = personById.get(s.createdById);
      if (!person) return null;
      return {
        id: person.id,
        name: person.name,
        role: person.role,
        division: person.division?.name ?? null,
        submitted: s._count._all,
        completed: completedById.get(s.createdById) ?? 0,
      };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);
}
