import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

const QUEUE_SELECT = {
  id: true,
  orderNumber: true,
  status: true,
  priority: true,
  companyName: true,
  customerName: true,
  createdAt: true,
  slaDeadline: true,
  gstNumber: true,
  sampleRequested: true,
  sampleShippedAt: true,
  sampleReceivedAt: true,
  customerFeedbackAt: true,
  headSampleRequestApprovedAt: true,
  sampleSpecsAcknowledgedAt: true,
  enquiryHandoff: true,
  assignedSupervisorId: true,
  currentDivision: { select: { name: true } },
  createdBy: { select: { name: true } },
  assignedSupervisor: { select: { name: true } },
} as const;

type Row = Prisma.OrderGetPayload<{ select: typeof QUEUE_SELECT }>;

export type ActionItem = {
  id: number;
  orderNumber: string;
  company: string | null;
  customer: string | null;
  status: string;
  priority: string;
  division: string | null;
  /** Plain-language sentence saying what has to happen. */
  reason: string;
  /** The words on the button that takes you there. */
  actionLabel: string;
  ageDays: number;
  overdue: boolean;
};

/** How far down the open book we look when building a queue. */
const SCAN_LIMIT = 200;

/**
 * The queue that answers "what do I do next, and what am I waiting on?".
 *
 * Every role gets two lists:
 *   needsYou   — the signed-in person owes the next move
 *   waitingOn  — somebody else owes it, named where we know who
 *
 * Each item carries its reason in plain words, so a row never leaves the
 * reader to work out why it is in front of them.
 *
 * One query feeds the whole thing (plus one more for the Accounts billing
 * case). The Neon pooler hands out a single connection, so classification
 * happens in JavaScript rather than as a dozen targeted queries.
 */
export async function buildQueues(
  role: string,
  userId: number,
  scope: Prisma.OrderWhereInput,
  now: Date
): Promise<{ needsYou: ActionItem[]; waitingOn: ActionItem[] }> {
  const openRows = await prisma.order.findMany({
    where: { ...scope, status: { in: ["PLACED", "IN_PROGRESS", "TRANSFERRED"] } },
    select: QUEUE_SELECT,
    orderBy: [{ priority: "desc" }, { slaDeadline: "asc" }, { createdAt: "asc" }],
    take: SCAN_LIMIT,
  });

  const needsYou: ActionItem[] = [];
  const waitingOn: ActionItem[] = [];

  const needs = (r: Row, reason: string, actionLabel: string) =>
    needsYou.push(toItem(r, reason, actionLabel, now));
  const waits = (r: Row, reason: string) => waitingOn.push(toItem(r, reason, "View", now));

  const unassigned = (r: Row) => r.enquiryHandoff == null;
  const division = (r: Row) => r.currentDivision?.name ?? "the division";

  for (const r of openRows) {
    switch (role) {
      case "USER": {
        // ── Salesperson: their own enquiries ──────────────────────────
        if (r.headSampleRequestApprovedAt && !r.sampleSpecsAcknowledgedAt) {
          needs(
            r,
            "The division head approved the sample specifications. Confirm you have read them before production ships.",
            "Review specs"
          );
        } else if (r.sampleShippedAt && !r.sampleReceivedAt) {
          needs(
            r,
            "The sample has been dispatched. Confirm you received it so the customer step can begin.",
            "Confirm receipt"
          );
        } else if (r.sampleReceivedAt && !r.customerFeedbackAt) {
          needs(
            r,
            "You have the sample. Record what the customer said about it — this enquiry cannot close without it.",
            "Add feedback"
          );
        } else if (r.status === "PLACED") {
          waits(r, `Submitted to ${division(r)}. Waiting for the division head to accept it.`);
        } else if (unassigned(r)) {
          waits(r, `Accepted by ${division(r)}, but no production person is assigned yet.`);
        } else if (r.sampleRequested && !r.sampleShippedAt) {
          waits(
            r,
            r.assignedSupervisor?.name
              ? `${r.assignedSupervisor.name} is preparing the sample.`
              : "Production is preparing the sample."
          );
        }
        break;
      }

      case "DIVISION_HEAD":
      case "MANAGER": {
        // ── Division head: the gatekeeper for the whole division ──────
        if (r.status === "PLACED") {
          needs(
            r,
            `${r.createdBy?.name ?? "A salesperson"} submitted this. Accept it, transfer it, or reject it with a reason.`,
            "Accept or reject"
          );
        } else if (r.status === "IN_PROGRESS" && unassigned(r)) {
          needs(
            r,
            "Accepted but nobody is working on it. Assign a production person to start work.",
            "Assign someone"
          );
        } else if (r.sampleRequested && !r.headSampleRequestApprovedAt) {
          needs(
            r,
            "A sample was requested. Approve the specifications so production can begin.",
            "Approve sample"
          );
        } else if (r.sampleRequested && !r.sampleShippedAt) {
          waits(
            r,
            r.assignedSupervisor?.name
              ? `${r.assignedSupervisor.name} is preparing the sample.`
              : "Production is preparing the sample."
          );
        } else if (r.sampleShippedAt && !r.customerFeedbackAt) {
          waits(
            r,
            `${r.createdBy?.name ?? "The salesperson"} is collecting the customer's response to the sample.`
          );
        }
        break;
      }

      case "SUPERVISOR": {
        // ── Production: only what has been handed to this person ──────
        if (r.assignedSupervisorId === userId && r.status === "IN_PROGRESS") {
          needs(
            r,
            r.sampleRequested && !r.sampleShippedAt
              ? "Assigned to you. Prepare the sample and record the dispatch details."
              : "Assigned to you. Record progress so the division head can close it.",
            "Open enquiry"
          );
        } else if (r.assignedSupervisorId == null) {
          waits(
            r,
            "In your division but not assigned to anyone. The division head decides who takes it."
          );
        }
        break;
      }

      case "ASM": {
        // ── Read-only observer: what to raise, not what to do ─────────
        if (r.slaDeadline && r.slaDeadline < now) {
          waits(r, `Past its deadline with ${division(r)}. Raise it with the division head.`);
        } else if (r.status === "IN_PROGRESS" && unassigned(r)) {
          waits(r, `${division(r)} accepted this but has not assigned anyone yet.`);
        }
        break;
      }

      case "ACCOUNTS": {
        waits(r, `Still with ${division(r)}. Nothing to bill until it completes.`);
        break;
      }

      default: {
        // ── Managing Director and Admin: exceptions only ──────────────
        if (r.slaDeadline && r.slaDeadline < now) {
          needs(r, `Past its deadline with ${division(r)}. Nobody has resolved it.`, "Investigate");
        } else if (r.priority === "CRITICAL") {
          needs(r, `Marked critical and still open with ${division(r)}.`, "Review");
        } else if (r.status === "IN_PROGRESS" && unassigned(r)) {
          waits(r, `${division(r)} accepted this but has not assigned anyone.`);
        } else if (r.status === "PLACED") {
          waits(r, `Waiting for ${division(r)} to accept it.`);
        }
        break;
      }
    }
  }

  // Accounts bills from completed work, so their action list lives outside
  // the open book.
  if (role === "ACCOUNTS") {
    const billing = await prisma.order.findMany({
      where: { ...scope, status: "COMPLETED", gstNumber: null },
      select: QUEUE_SELECT,
      orderBy: { completedAt: "desc" },
      take: 50,
    });
    for (const r of billing) {
      needs(
        r,
        `${r.companyName ?? "This customer"} has no GST number recorded. Add it before invoicing.`,
        "Add GST details"
      );
    }
  }

  return { needsYou, waitingOn };
}

function toItem(r: Row, reason: string, actionLabel: string, now: Date): ActionItem {
  const ageDays = Math.max(0, Math.floor((now.getTime() - r.createdAt.getTime()) / 86_400_000));
  return {
    id: r.id,
    orderNumber: r.orderNumber,
    company: r.companyName,
    customer: r.customerName,
    status: r.status,
    priority: r.priority,
    division: r.currentDivision?.name ?? null,
    reason,
    actionLabel,
    ageDays,
    overdue: Boolean(r.slaDeadline && r.slaDeadline < now),
  };
}
