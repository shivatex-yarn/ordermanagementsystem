import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logAudit, notify, salesInDivision, superAdminIds } from "@/lib/activity";
import { withAuth } from "@/lib/with-auth";
import { accessRequestSchema } from "@/lib/validation";

const include = {
  user: { select: { id: true, name: true, role: true } },
  division: { select: { id: true, name: true } },
  decidedBy: { select: { name: true } },
} as const;

/** Super admin sees every request; others see their own. */
export async function GET() {
  const auth = await withAuth();
  if (auth.response) return auth.response;
  const isAdmin = auth.payload.role === "SUPER_ADMIN";
  const requests = await prisma.divisionAccessRequest.findMany({
    where: isAdmin ? {} : { userId: Number(auth.payload.sub) },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
    include,
  });
  return NextResponse.json({ requests });
}

/** Marketing / Sales ask for another division. */
export async function POST(req: Request) {
  const auth = await withAuth();
  if (auth.response) return auth.response;
  if (auth.payload.role !== "MARKETING" && auth.payload.role !== "SALES") {
    return NextResponse.json({ error: "You already see every division" }, { status: 400 });
  }
  const parsed = accessRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const userId = Number(auth.payload.sub);
  const { divisionId, reason } = parsed.data;
  if (await prisma.userDivision.findUnique({ where: { userId_divisionId: { userId, divisionId } } })) {
    return NextResponse.json({ error: "You already have access to that division" }, { status: 409 });
  }
  if (await prisma.divisionAccessRequest.findFirst({ where: { userId, divisionId, status: "PENDING" } })) {
    return NextResponse.json({ error: "You already asked for this division. Wait for the admin." }, { status: 409 });
  }
  const created = await prisma.divisionAccessRequest.create({ data: { userId, divisionId, reason }, include });
  await logAudit({ actor: auth.payload, action: "ACCESS_REQUESTED", category: "ACCESS", entityType: "Division", entityId: divisionId, entityLabel: created.division.name, detail: reason, req });
  void notify(await superAdminIds(), { type: "ACCESS_REQUEST", title: `${created.user.name} wants ${created.division.name}`, body: reason, link: "/divisions" });
  return NextResponse.json(created, { status: 201 });
}
