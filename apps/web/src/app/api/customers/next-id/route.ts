/**
 * GET /api/customers/next-id
 *
 * Returns the next auto-generated customer identifier in the form `CUS-XXXX`.
 * The 4-digit sequence is computed from the count of distinct `customer_id` values
 * already stored on enquiries. This is a friendly identifier — the create-enquiry
 * form pre-fills the field with the value returned here, and salespersons can't
 * edit it. Two concurrent submissions could theoretically collide, but customer ID
 * is not a unique key (the same customer can have many enquiries), so a duplicate
 * is harmless and the next request will skip past it.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";

function format(n: number): string {
  return `CUS-${String(n).padStart(4, "0")}`;
}

export async function GET() {
  const auth = await withAuth();
  if (auth.response) return auth.response;
  try {
    /**
     * Find the highest existing CUS-XXXX (numeric portion) and add 1.
     * Falls back to 1 when no customers exist yet.
     */
    const rows = await prisma.order.findMany({
      where: { customerId: { startsWith: "CUS-" } },
      select: { customerId: true },
      distinct: ["customerId"],
    });
    let maxSeq = 0;
    for (const r of rows) {
      const m = /^CUS-(\d+)$/.exec(r.customerId ?? "");
      if (m) {
        const n = Number(m[1]);
        if (Number.isFinite(n) && n > maxSeq) maxSeq = n;
      }
    }
    return NextResponse.json({ nextId: format(maxSeq + 1) });
  } catch (err) {
    console.error("[GET /api/customers/next-id]", err);
    // Fail open with a timestamp-derived placeholder so the form is never blocked.
    return NextResponse.json({ nextId: `CUS-${String(Date.now() % 10000).padStart(4, "0")}` });
  }
}
