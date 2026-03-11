/**
 * Background worker: SLA breach detection.
 * Run with: npx tsx scripts/sla-worker.ts
 * In production, run via BullMQ worker with Redis.
 */

import { Queue, Worker } from "bullmq";
import { PrismaClient } from "@prisma/client";

const connection = {
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379", 10),
};

const SLA_HOURS = 48;
const prisma = new PrismaClient();

function addHours(date: Date, h: number): Date {
  const d = new Date(date);
  d.setHours(d.getHours() + h);
  return d;
}

export const slaQueueName = "oms:sla-check";

export async function enqueueSlaCheck() {
  const queue = new Queue(slaQueueName, { connection });
  await queue.add("check", {}, { repeat: { pattern: "*/5 * * * *" } }); // every 5 min
}

const worker = new Worker(
  slaQueueName,
  async () => {
    const now = new Date();
    const orders = await prisma.order.findMany({
      where: {
        status: { in: ["PLACED", "TRANSFERRED"] },
        slaDeadline: { lt: now },
      },
      select: { id: true, orderNumber: true, currentDivisionId: true },
    });
    for (const order of orders) {
      const existing = await prisma.sLABreach.findFirst({
        where: { orderId: order.id, resolvedAt: null },
      });
      if (!existing) {
        await prisma.sLABreach.create({
          data: { orderId: order.id, divisionId: order.currentDivisionId },
        });
        console.log(`SLA breach recorded: ${order.orderNumber}`);
      }
    }
  },
  { connection }
);

worker.on("error", (err) => console.error("SLA worker error:", err));
console.log("SLA worker started");
