import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withRole } from "@/lib/with-auth";

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
    default:
      return order.status;
  }
}

/** Managing Director + Super Admin: full operational & escalation visibility */
export async function GET() {
  const auth = await withRole(["MANAGING_DIRECTOR", "SUPER_ADMIN"]);
  if (auth.response) return auth.response;

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
      },
      orderBy: { breachedAt: "desc" },
      take: 40,
    }),
    prisma.order.findMany({
      take: 100,
      orderBy: { updatedAt: "desc" },
      where: { status: { not: "REJECTED" } },
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
          select: { id: true, breachedAt: true },
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
}
