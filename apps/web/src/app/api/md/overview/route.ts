import { NextResponse } from "next/server";
import type { OrderStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { withRole } from "@/lib/with-auth";
import { runSlaBreachCheck } from "@/lib/sla-breach-job";
import { parseCreatedAtRangeFromParams } from "@/lib/date-period";
import { dbUnavailableJson, isDbUnavailableError } from "@/lib/db-errors";

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
    /** Create `sla_breaches` + notify for any overdue orders (same as cron). Keeps UI in sync if cron is misconfigured. */
    await runSlaBreachCheck().catch((err) => {
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
        take: 50,
      }),
      prisma.sLABreach.findMany({
        where: { resolvedAt: null },
        include: {
          order: { select: { id: true, orderNumber: true, status: true } },
          division: { select: { id: true, name: true } },
          headRejectedBy: { select: { id: true, name: true, email: true } },
        },
        orderBy: { breachedAt: "desc" },
        take: 40,
      }),
      prisma.order.findMany({
        take: 100,
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
          slaBreaches: {
            where: { resolvedAt: null },
            take: 1,
            select: {
              id: true,
              breachedAt: true,
              headRejectedAt: true,
              headRejectedById: true,
              headRejectionMessage: true,
            },
          },
          transfers: {
            orderBy: { createdAt: "desc" },
            take: 2,
            select: {
              id: true,
              createdAt: true,
              reason: true,
              fromDivision: { select: { name: true } },
              toDivision: { select: { name: true } },
              transferredBy: { select: { name: true, email: true } },
            },
          },
        },
      }),
      prisma.orderTransfer.findMany({
        take: 45,
        orderBy: { createdAt: "desc" },
        include: {
          order: { select: { id: true, orderNumber: true, status: true } },
          fromDivision: { select: { id: true, name: true } },
          toDivision: { select: { id: true, name: true } },
          transferredBy: { select: { id: true, name: true, email: true } },
        },
      }),
    ]);

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
    const openBreach = o.slaBreaches[0];
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
      escalated: Boolean(openBreach),
      breachAt: openBreach?.breachedAt.toISOString() ?? null,
      pastDueSla: pastDue,
      hoursPastSla: hoursPastSla != null ? Math.round(hoursPastSla * 10) / 10 : null,
      recentTransfers: o.transfers.map((t) => ({
        id: t.id,
        at: t.createdAt.toISOString(),
        from: t.fromDivision.name,
        to: t.toDivision.name,
        by: t.transferredBy.name,
        reasonPreview: t.reason.length > 200 ? `${t.reason.slice(0, 200)}…` : t.reason,
      })),
    };
  });

    return NextResponse.json({
      statusCounts: Object.fromEntries(statusCounts.map((r) => [r.status, r._count.id])),
      openBreaches: openBreachesCount,
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
    });
  } catch (err) {
    console.error("[md/overview] GET failed:", err);
    if (isDbUnavailableError(err)) return dbUnavailableJson();
    return NextResponse.json({ error: "Overview endpoint failed." }, { status: 500 });
  }
}
