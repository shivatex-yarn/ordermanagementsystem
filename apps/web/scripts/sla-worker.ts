/**
 * Background worker: SLA breach detection + notifications/email.
 * Run with: npx tsx scripts/sla-worker.ts
 * Requires Redis for BullMQ repeat jobs.
 */

import { Queue, Worker } from "bullmq";
import { runSlaBreachCheck } from "../src/lib/sla-breach-job";

const connection = {
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379", 10),
};

export const slaQueueName = "oms:sla-check";

export async function enqueueSlaCheck() {
  const queue = new Queue(slaQueueName, { connection });
  await queue.add("check", {}, { repeat: { pattern: "*/5 * * * *" } }); // every 5 min
}

const worker = new Worker(
  slaQueueName,
  async () => {
    const { breachesCreated } = await runSlaBreachCheck();
    if (breachesCreated > 0) {
      console.log(`SLA: recorded ${breachesCreated} new breach(es) and sent notifications`);
    }
  },
  { connection }
);

worker.on("error", (err) => console.error("SLA worker error:", err));
console.log("SLA worker started");
