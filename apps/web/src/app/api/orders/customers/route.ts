import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";
import { canCreateEnquiry } from "@/lib/roles";
import { scopeWhere } from "@/lib/orders";

/**
 * Earlier clients, for auto-filling the New enquiry form. Match by company name (?q=) or exact GST number (?gst=).
 * Returns the latest details we have for each company, from enquiries the person is allowed to see.
 */
export async function GET(req: Request) {
  const auth = await withAuth();
  if (auth.response) return auth.response;
  if (!canCreateEnquiry(auth.payload.role)) return NextResponse.json({ customers: [] });
  const sp = new URL(req.url).searchParams;
  const q = sp.get("q")?.trim() ?? "";
  const gst = sp.get("gst")?.trim().toUpperCase() ?? "";
  if (q.length < 2 && gst.length < 15) return NextResponse.json({ customers: [] });

  const rows = await prisma.order.findMany({
    where: {
      ...(await scopeWhere(auth.payload)),
      companyName: { not: null },
      ...(gst.length >= 15 ? { gstNumber: { equals: gst, mode: "insensitive" } } : { companyName: { contains: q, mode: "insensitive" } }),
    },
    orderBy: { createdAt: "desc" },
    take: 60,
    select: { companyName: true, customerName: true, customerPhone: true, customerEmail: true, customerAddress: true, gstNumber: true },
  });
  const seen = new Set<string>();
  const customers = rows.filter((r) => {
    const k = (r.companyName ?? "").trim().toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 8);
  return NextResponse.json({ customers });
}
