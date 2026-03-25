import { prisma } from "@/lib/db";
import type { OrderEvent } from "@/lib/events";

/**
 * POST each enquiry event to n8n (or any automation URL) for workflows:
 * Resend sequences, approvals, timers, escalations, multi-division, etc.
 *
 * Set N8N_WEBHOOK_URL to your n8n Webhook node URL. Optional N8N_WEBHOOK_SECRET
 * is sent as X-Webhook-Secret for simple verification in n8n.
 */
export async function postEventToN8n(event: OrderEvent): Promise<void> {
  const url = process.env.N8N_WEBHOOK_URL;
  if (!url?.trim()) return;

  const order = await prisma.order.findUnique({
    where: { id: event.orderId },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      currentDivision: { select: { id: true, name: true } },
      sampleApprovedBy: { select: { id: true, name: true, email: true } },
    },
  });

  const secret = process.env.N8N_WEBHOOK_SECRET;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-OMS-Event": event.type,
  };
  if (secret) headers["X-Webhook-Secret"] = secret;

  const body = JSON.stringify({
    event,
    order,
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  });

  try {
    const res = await fetch(url, { method: "POST", headers, body });
    if (!res.ok) {
      console.error("[n8n] Webhook returned", res.status, await res.text().catch(() => ""));
    }
  } catch (err) {
    console.error("[n8n] Webhook failed:", err);
  }
}
