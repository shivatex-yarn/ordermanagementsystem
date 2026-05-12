import { NextResponse } from "next/server";
import type { OrderStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { withRole } from "@/lib/with-auth";
import { runSlaBreachCheck } from "@/lib/sla-breach-job";
import { parseCreatedAtRangeFromParams } from "@/lib/date-period";
import { dbUnavailableJson, isDbUnavailableError } from "@/lib/db-errors";
import { divisionSlaBreakdown } from "@/lib/sla-service";
import { getRecentTimeline } from "@/lib/timeline";

const ALL_ORDER_STATUSES: OrderStatus[] = [
  "PLACED",
  "IN_PROGRESS",
  "TRANSFERRED",
  "REJECTED",
  "CANCELLED",
  "COMPLETED",
];

function buildPipelineWhere(searchParams: URLSearchParams): Prisma.OrderWhereInput {
  const dateFrom = searchParams.get("from")?.trim() || null;
  const dateTo = searchParams.get("to")?.trim() || null;
  const createdRange = parseCreatedAtRangeFromParams(dateFrom, dateTo);
  const statusRaw = searchParams.get("status")?.trim() || "";
  const divisionRaw = searchParams.get("divisionId")?.trim() || "";

  const where: Prisma.OrderWhereInput = {};

  if (statusRaw && ALL_ORDER_STATUSES.includes(statusRaw as OrderStatus)) {
    where.status = statusRaw as OrderStatus;
  } else {
    where.status = { notIn: ["REJECTED", "CANCELLED"] };
  }

  if (createdRange) {
    where.createdAt = { gte: createdRange.gte, lte: createdRange.lte };
  }

  if (divisionRaw) {
    const id = Number(divisionRaw);
    if (Number.isFinite(id) && id > 0) {
      where.currentDivisionId = id;
    }
  }

  return where;
}

function responseLabel(order: {
  status: string;
  acceptedBy: { name: string } | null;
  receivedBy: { name: string } | null;
  completedBy: { name: string } | null;
}): string {
  switch (order.status) {
    case "COMPLETED":
      return order.completedBy ? `Completed by ${order.completedBy.name}` : "Completed";
    case "REJECTED":
      return "Rejected";
    case "IN_PROGRESS":
      return order.acceptedBy ? `In progress (accepted by ${order.acceptedBy.name})` : "In progress";
    case "PLACED":
      return order.acceptedBy
        ? `Placed · accepted by ${order.acceptedBy.name}`
        : "Awaiting division head acceptance";
    case "TRANSFERRED":
      return order.receivedBy
        ? `Transferred · received by ${order.receivedBy.name}`
        : "Awaiting receive in new division (Division Head must receive)";
    case "CANCELLED":
      return "Cancelled by submitter";
    default:
      return order.status;
  }
}

/** Managing Director + Super Admin: full operational & escalation visibility */
export async function GET(req: Request) {
  const auth = await withRole(["MANAGING_DIRECTOR", "SUPER_ADMIN"]);
  if (auth.response) return auth.response;

  try {
    /**
     * Fire-and-forget: run the SLA breach sync in the background. The cron does this
     * nightly; we just trigger an async run here for safety, never block the response.
     */
    void runSlaBreachCheck().catch((err) => {
      console.error("[md/overview] SLA breach sync failed:", err);
    });

    const { searchParams } = new URL(req.url);
    const pipelineWhere = buildPipelineWhere(searchParams);

    const now = new Date();

    const [
      statusCounts,
      openBreachesCount,
      delayedEnquiries,
      recentBreaches,
      pipelineOrders,
      recentTransfers,
    ] = await Promise.all([
      prisma.order.groupBy({
        by: ["status"],
        _count: { id: true },
      }),
      prisma.sLABreach.count({ where: { resolvedAt: null } }),
      prisma.order.findMany({
        where: {
          status: { in: ["PLACED", "TRANSFERRED"] },
          slaDeadline: { lt: now },
        },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          slaDeadline: true,
          companyName: true,
          currentDivision: { select: { id: true, name: true } },
        },
        orderBy: { slaDeadline: "asc" },
        take: 20,
      }),
      prisma.sLABreach.findMany({
        where: { resolvedAt: null },
        select: {
          id: true,
          breachedAt: true,
          headRejectedAt: true,
          headRejectionMessage: true,
          order: { select: { id: true, orderNumber: true, status: true } },
          division: { select: { id: true, name: true } },
          headRejectedBy: { select: { id: true, name: true, email: true } },
        },
        orderBy: { breachedAt: "desc" },
        take: 20,
      }),
      // Pipeline: drop deep `transfers` + `slaBreaches` joins which weren't surfaced on the new MD UI.
      // Keep one open breach for the escalation flag via a cheaper sub-query later.
      prisma.order.findMany({
        take: 30,
        orderBy: { updatedAt: "desc" },
        where: pipelineWhere,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          companyName: true,
          description: true,
          createdAt: true,
          updatedAt: true,
          slaDeadline: true,
          transferCount: true,
          currentDivision: { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true, email: true } },
          acceptedBy: { select: { id: true, name: true, email: true } },
          receivedBy: { select: { id: true, name: true, email: true } },
          completedBy: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.orderTransfer.findMany({
        take: 20,
        orderBy: { createdAt: "desc" },
        include: {
          order: { select: { id: true, orderNumber: true, status: true } },
          fromDivision: { select: { id: true, name: true } },
          toDivision: { select: { id: true, name: true } },
          transferredBy: { select: { id: true, name: true, email: true } },
        },
      }),
    ]);

    // Single batch lookup of unresolved breach order-ids → used to flag pipeline escalation
    // without doing per-row sub-queries. Cheap and avoids the n+1 problem the old shape had.
    const pipelineOrderIds = pipelineOrders.map((o) => o.id);
    const escalatedSet = pipelineOrderIds.length
      ? new Set(
          (
            await prisma.sLABreach.findMany({
              where: { orderId: { in: pipelineOrderIds }, resolvedAt: null },
              select: { orderId: true },
            })
          ).map((r) => r.orderId)
        )
      : new Set<number>();

  const divisionIds = [...new Set(pipelineOrders.map((o) => o.currentDivision.id))];
  const managersByDivision = new Map<number, { name: string; email: string }[]>();
  if (divisionIds.length) {
    const links = await prisma.divisionManager.findMany({
      where: { divisionId: { in: divisionIds } },
      include: { user: { select: { name: true, email: true, active: true } } },
    });
    for (const l of links) {
      if (!l.user.active) continue;
      const list = managersByDivision.get(l.divisionId) ?? [];
      list.push({ name: l.user.name, email: l.user.email });
      managersByDivision.set(l.divisionId, list);
    }
  }

  const pipeline = pipelineOrders.map((o) => {
    const heads = managersByDivision.get(o.currentDivision.id) ?? [];
    const escalated = escalatedSet.has(o.id);
    const pastDue =
      o.slaDeadline != null &&
      o.slaDeadline < now &&
      (o.status === "PLACED" || o.status === "TRANSFERRED");
    const hoursPastSla =
      o.slaDeadline && pastDue
        ? Math.max(0, (now.getTime() - new Date(o.slaDeadline).getTime()) / 36e5)
        : null;

    return {
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      companyName: o.companyName,
      descriptionPreview: o.description ? o.description.slice(0, 160) + (o.description.length > 160 ? "…" : "") : null,
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
      slaDeadline: o.slaDeadline?.toISOString() ?? null,
      transferCount: o.transferCount,
      currentDivision: o.currentDivision,
      divisionHeads: heads,
      createdBy: o.createdBy,
      acceptedBy: o.acceptedBy,
      receivedBy: o.receivedBy,
      completedBy: o.completedBy,
      responseSummary: responseLabel(o),
      escalated,
      breachAt: null,
      pastDueSla: pastDue,
      hoursPastSla: hoursPastSla != null ? Math.round(hoursPastSla * 10) / 10 : null,
      recentTransfers: [] as Array<{ id: number; at: string; from: string; to: string; by: string; reasonPreview: string }>,
    };
  });

    /**
     * Additive widgets — priority counts, division-SLA breakdown, recent timeline.
     * Each is wrapped so a missing column / un-generated client / missing table
     * never destroys the entire dashboard response. We fall back to safe defaults
     * and log so the user can see in the server logs which feature needs migrating.
     */
    const safe = async <T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
      try {
        return await fn();
      } catch (err) {
        console.warn(`[md/overview] ${label} skipped:`, err instanceof Error ? err.message : err);
        return fallback;
      }
    };

    const [priorityCounts, slaBreakdown, recentTimelineEvents, pendingApprovalsCount, samplesPendingHead] =
      await Promise.all([
        safe(
          "priorityCounts",
          () =>
            prisma.order.groupBy({
              by: ["priority"],
              where: { status: { notIn: ["REJECTED", "CANCELLED", "COMPLETED"] } },
              _count: { id: true },
            }),
          [] as Array<{ priority: string; _count: { id: number } }>
        ),
        safe("divisionSlaBreakdown", () => divisionSlaBreakdown(), { breakdown: [], breaches: [] }),
        safe(
          "recentTimeline",
          () => getRecentTimeline(40),
          [] as Awaited<ReturnType<typeof getRecentTimeline>>
        ),
        safe("pendingApprovalsCount", () => prisma.order.count({ where: { status: "PLACED" } }), 0),
        safe(
          "samplesPendingHead",
          () =>
            prisma.order.count({
              where: {
                sampleRequested: true,
                headSampleRequestApprovedAt: null,
                status: { notIn: ["REJECTED", "CANCELLED"] },
              },
            }),
          0
        ),
      ]);

    const res = NextResponse.json({
      statusCounts: Object.fromEntries(statusCounts.map((r) => [r.status, r._count.id])),
      openBreaches: openBreachesCount,
      pendingApprovalsCount,
      samplesPendingHead,
      priorityCounts: Object.fromEntries(priorityCounts.map((r) => [r.priority, r._count.id])),
      divisionSla: slaBreakdown.breakdown,
      delayedEnquiries: delayedEnquiries.map((o) => ({
        ...o,
        slaDeadline: o.slaDeadline?.toISOString() ?? null,
      })),
      recentBreaches: recentBreaches.map((b) => ({
        id: b.id,
        breachedAt: b.breachedAt.toISOString(),
        order: b.order,
        division: b.division,
        headRejectedAt: b.headRejectedAt?.toISOString() ?? null,
        headRejectedBy: b.headRejectedBy ? { ...b.headRejectedBy } : null,
        headRejectionMessage: b.headRejectionMessage ?? null,
      })),
      pipeline,
      transfers: recentTransfers.map((t) => ({
        id: t.id,
        createdAt: t.createdAt.toISOString(),
        reason: t.reason,
        order: t.order,
        fromDivision: t.fromDivision,
        toDivision: t.toDivision,
        transferredBy: t.transferredBy,
      })),
      recentTimeline: recentTimelineEvents.map((e) => ({
        id: e.id,
        type: e.type,
        title: e.title,
        detail: e.detail,
        createdAt: e.createdAt.toISOString(),
        actor: e.actor,
        order: e.order,
      })),
    });
    // Edge-cache the response for 15s + serve stale up to 30s while revalidating.
    // The page refetches every 60s, so most reloads hit cache instead of round-tripping Postgres.
    res.headers.set("Cache-Control", "private, max-age=10, s-maxage=15, stale-while-revalidate=30");
    return res;
  } catch (err) {
    console.error("[md/overview] GET failed:", err);
    if (isDbUnavailableError(err)) return dbUnavailableJson();
    return NextResponse.json({ error: "Overview endpoint failed." }, { status: 500 });
  }
}
