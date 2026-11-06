import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { buildOrderWhere } from "@/lib/order-filters";

const LIMIT = 5000;

/** Every enquiry matching the list filters (no paging), with full detail, for Excel / PDF download. */
export async function GET(req: Request) {
  const auth = await withAuth();
  if (auth.response) return auth.response;
  const { where } = await buildOrderWhere(new URL(req.url).searchParams, auth.payload);
  const [rows, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: [{ enquiryDate: "desc" }, { id: "desc" }],
      take: LIMIT,
      select: {
        orderNumber: true, status: true, enquiryDate: true, customerName: true, companyName: true, customerPhone: true,
        customerEmail: true, customerAddress: true, gstNumber: true, productDetails: true, isSample: true, sampleSentAt: true,
        sampleCourierName: true, sampleTrackingId: true, pricePerUnit: true, priceUnit: true, quantity: true, paymentTerms: true,
        deliveryTime: true, pricedAt: true, clientResponse: true, clientFeedback: true, clientFeedbackAt: true,
        division: { select: { name: true } }, createdBy: { select: { name: true } }, pricedBy: { select: { name: true } },
      },
    }),
    prisma.order.count({ where }),
  ]);
  return NextResponse.json({ rows, total, truncated: total > rows.length });
}
