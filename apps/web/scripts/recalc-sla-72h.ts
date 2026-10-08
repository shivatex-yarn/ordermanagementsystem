/**
 * One-off migration: recalculate SLA deadlines on OPEN enquiries to the strict
 * 72-hour rule (stage start + 72h, no business-hours/holiday padding).
 *
 * Anchors used per stage (exact where a timestamp exists, else a fallback that
 * converts the old deadline arithmetically):
 *   slaDeadline                    ← createdAt (PLACED, never transferred),
 *                                    latest OrderReceived audit / latest transfer (TRANSFERRED)
 *   handoffSlaDeadline             ← latest OrderAccepted audit
 *   headSampleApprovalSlaDeadline  ← enquiryHandoff.submittedAt
 *   sampleDetailsSlaDeadline       ← headSampleRequestApprovedAt
 *   sampleApprovalSlaDeadline      ← first SampleDetailsUpdated audit
 *   shipmentSlaDeadline            ← sampleApprovedAt
 * Fallback: newDeadline = oldDeadline + (72 − oldStageHours) hours
 * (old stage hours: placement 48, handoff 24, head-sample-approval 24,
 *  sample-details 48, sample-approval 24, shipment 48).
 *
 * Run:  cd apps/web && npx tsx scripts/recalc-sla-72h.ts          (dry run)
 *       cd apps/web && npx tsx scripts/recalc-sla-72h.ts --apply  (write changes)
 */

import { prisma } from "../src/lib/db";

const APPLY = process.argv.includes("--apply");
const H = 3_600_000;
const NEW_HOURS = 72;

function plus72(anchor: Date): Date {
  return new Date(anchor.getTime() + NEW_HOURS * H);
}
function fallback(oldDeadline: Date, oldHours: number): Date {
  return new Date(oldDeadline.getTime() + (NEW_HOURS - oldHours) * H);
}

async function latestAudit(orderId: number, action: string): Promise<Date | null> {
  const row = await prisma.auditLog.findFirst({
    where: { orderId, action },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return row?.createdAt ?? null;
}
async function firstAudit(orderId: number, action: string): Promise<Date | null> {
  const row = await prisma.auditLog.findFirst({
    where: { orderId, action },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });
  return row?.createdAt ?? null;
}

async function main() {
  const orders = await prisma.order.findMany({
    where: {
      status: { in: ["PLACED", "TRANSFERRED", "IN_PROGRESS"] },
      OR: [
        { slaDeadline: { not: null } },
        { handoffSlaDeadline: { not: null } },
        { headSampleApprovalSlaDeadline: { not: null } },
        { sampleDetailsSlaDeadline: { not: null } },
        { sampleApprovalSlaDeadline: { not: null } },
        { shipmentSlaDeadline: { not: null } },
      ],
    },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      createdAt: true,
      transferCount: true,
      receivedById: true,
      enquiryHandoff: true,
      headSampleRequestApprovedAt: true,
      sampleApprovedAt: true,
      slaDeadline: true,
      handoffSlaDeadline: true,
      headSampleApprovalSlaDeadline: true,
      sampleDetailsSlaDeadline: true,
      sampleApprovalSlaDeadline: true,
      shipmentSlaDeadline: true,
      transfers: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true },
      },
    },
  });

  console.log(`${APPLY ? "APPLY" : "DRY RUN"} — ${orders.length} open enquiries with active SLA timers\n`);

  let updatedOrders = 0;
  for (const o of orders) {
    const data: Record<string, Date> = {};
    const log: string[] = [];

    const set = (field: string, oldD: Date | null, next: Date, how: string) => {
      if (!oldD) return;
      if (Math.abs(next.getTime() - oldD.getTime()) < 1000) return; // already correct
      data[field] = next;
      log.push(`  ${field}: ${oldD.toISOString()} → ${next.toISOString()} (${how})`);
    };

    // ── placement / transfer SLA ───────────────────────────────────────────
    if (o.slaDeadline) {
      if (o.status === "PLACED" && o.transferCount === 0) {
        set("slaDeadline", o.slaDeadline, plus72(o.createdAt), "createdAt+72h");
      } else if (o.status === "TRANSFERRED" || o.status === "PLACED") {
        const received = o.receivedById ? await latestAudit(o.id, "OrderReceived") : null;
        const anchor = received ?? o.transfers[0]?.createdAt ?? null;
        if (anchor) set("slaDeadline", o.slaDeadline, plus72(anchor), received ? "received+72h" : "transfer+72h");
        else set("slaDeadline", o.slaDeadline, fallback(o.slaDeadline, 48), "fallback old+24h");
      } else {
        // IN_PROGRESS: deadline was restarted at handoff for NEW developments
        const handoff =
          o.enquiryHandoff && typeof o.enquiryHandoff === "object"
            ? (o.enquiryHandoff as Record<string, unknown>)
            : null;
        const submittedAt = typeof handoff?.submittedAt === "string" ? new Date(handoff.submittedAt) : null;
        if (submittedAt && !isNaN(submittedAt.getTime())) {
          set("slaDeadline", o.slaDeadline, plus72(submittedAt), "handoff+72h");
        } else {
          set("slaDeadline", o.slaDeadline, fallback(o.slaDeadline, 48), "fallback old+24h");
        }
      }
    }

    // ── handoff SLA (started at acceptance) ────────────────────────────────
    if (o.handoffSlaDeadline) {
      const accepted = await latestAudit(o.id, "OrderAccepted");
      if (accepted) set("handoffSlaDeadline", o.handoffSlaDeadline, plus72(accepted), "accepted+72h");
      else set("handoffSlaDeadline", o.handoffSlaDeadline, fallback(o.handoffSlaDeadline, 24), "fallback old+48h");
    }

    // ── head sample approval SLA (started at handoff submission) ───────────
    if (o.headSampleApprovalSlaDeadline) {
      const handoff =
        o.enquiryHandoff && typeof o.enquiryHandoff === "object"
          ? (o.enquiryHandoff as Record<string, unknown>)
          : null;
      const submittedAt = typeof handoff?.submittedAt === "string" ? new Date(handoff.submittedAt) : null;
      if (submittedAt && !isNaN(submittedAt.getTime())) {
        set("headSampleApprovalSlaDeadline", o.headSampleApprovalSlaDeadline, plus72(submittedAt), "handoff+72h");
      } else {
        set(
          "headSampleApprovalSlaDeadline",
          o.headSampleApprovalSlaDeadline,
          fallback(o.headSampleApprovalSlaDeadline, 24),
          "fallback old+48h"
        );
      }
    }

    // ── sample details SLA (started at head sample-request approval) ───────
    if (o.sampleDetailsSlaDeadline) {
      if (o.headSampleRequestApprovedAt) {
        set("sampleDetailsSlaDeadline", o.sampleDetailsSlaDeadline, plus72(o.headSampleRequestApprovedAt), "headApproved+72h");
      } else {
        set("sampleDetailsSlaDeadline", o.sampleDetailsSlaDeadline, fallback(o.sampleDetailsSlaDeadline, 48), "fallback old+24h");
      }
    }

    // ── sample approval SLA (started at first details submission) ──────────
    if (o.sampleApprovalSlaDeadline) {
      const details = await firstAudit(o.id, "SampleDetailsUpdated");
      if (details) set("sampleApprovalSlaDeadline", o.sampleApprovalSlaDeadline, plus72(details), "details+72h");
      else set("sampleApprovalSlaDeadline", o.sampleApprovalSlaDeadline, fallback(o.sampleApprovalSlaDeadline, 24), "fallback old+48h");
    }

    // ── shipment SLA (started at sample approval) ──────────────────────────
    if (o.shipmentSlaDeadline) {
      if (o.sampleApprovedAt) {
        set("shipmentSlaDeadline", o.shipmentSlaDeadline, plus72(o.sampleApprovedAt), "sampleApproved+72h");
      } else {
        set("shipmentSlaDeadline", o.shipmentSlaDeadline, fallback(o.shipmentSlaDeadline, 48), "fallback old+24h");
      }
    }

    if (Object.keys(data).length === 0) continue;
    updatedOrders++;
    console.log(`${o.orderNumber} (#${o.id}, ${o.status})`);
    for (const l of log) console.log(l);

    if (APPLY) {
      await prisma.order.update({ where: { id: o.id }, data });
    }
  }

  console.log(
    `\n${APPLY ? "Updated" : "Would update"} ${updatedOrders} enquir${updatedOrders === 1 ? "y" : "ies"}.` +
      (APPLY ? "" : "  Re-run with --apply to write the changes.")
  );
}

main()
  .catch((err) => {
    console.error("recalc failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
