import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logAudit, notify, salesInDivision, superAdminIds } from "@/lib/activity";
import { withRole } from "@/lib/with-auth";
import { accessDecisionSchema } from "@/lib/validation";

/** Only the Super admin can grant or refuse division access. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await withRole(["SUPER_ADMIN"]);
  if (auth.response) return auth.response;
  const id = Number((await ctx.params).id);
  const parsed = accessDecisionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const request = await prisma.divisionAccessRequest.findUnique({ where: { id } });
  if (!request) return NextResponse.json({ error: "Request not found" }, { status: 404 });
  if (request.status !== "PENDING") {
    return NextResponse.json({ error: "This request was already decided" }, { status: 409 });
  }
  await prisma.$transaction([
    prisma.divisionAccessRequest.update({
      where: { id },
      data: {
        status: parsed.data.decision,
        decidedById: Number(auth.payload.sub),
        decidedAt: new Date(),
        decisionNote: parsed.data.note ?? null,
      },
    }),
    ...(parsed.data.decision === "APPROVED"
      ? [
          prisma.userDivision.upsert({
            where: { userId_divisionId: { userId: request.userId, divisionId: request.divisionId } },
            update: {},
            create: { userId: request.userId, divisionId: request.divisionId },
          }),
        ]
      : []),
  ]);
  const who = await prisma.user.findUnique({ where: { id: request.userId }, select: { name: true } });
  const div = await prisma.division.findUnique({ where: { id: request.divisionId }, select: { name: true } });
  await logAudit({ actor: auth.payload, action: parsed.data.decision === "APPROVED" ? "ACCESS_APPROVED" : "ACCESS_DECLINED", category: "ACCESS", entityType: "Division", entityId: request.divisionId, entityLabel: div?.name, detail: `For ${who?.name ?? "user"}`, req });
  void notify([request.userId], { type: "ACCESS_DECISION", title: `${div?.name ?? "Division"} access ${parsed.data.decision === "APPROVED" ? "approved" : "declined"}`, body: parsed.data.decision === "APPROVED" ? "You can now log and see enquiries in this division." : "The admin declined this request.", link: "/divisions" });
  return NextResponse.json({ ok: true });
}
