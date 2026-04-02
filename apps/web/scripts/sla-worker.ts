/**
 * One-shot SLA breach check. Schedule via cron or your host’s job runner, e.g. every 5 minutes:
 *   cd apps/web && npx tsx scripts/sla-worker.ts
 * (No Redis — suitable for serverless/cron triggers.)
 */

import { runSlaBreachCheck } from "../src/lib/sla-breach-job";

async function main() {
  const { breachesCreated } = await runSlaBreachCheck();
  if (breachesCreated > 0) {
    console.log(`SLA: recorded ${breachesCreated} new breach(es) and sent notifications`);
  } else {
    console.log("SLA: no new breaches");
  }
}

main().catch((err) => {
  console.error("SLA job failed:", err);
  process.exit(1);
});
