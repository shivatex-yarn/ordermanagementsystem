import { prisma } from "@/lib/db";
import { withAuth } from "@/lib/with-auth";

const PAGE_SIZE = 30;

export async function GET(req: Request) {
  const auth = await withAuth();
  if (auth.response) return auth.response;

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const userId = Number(auth.payload.sub);
  if (!Number.isInteger(userId) || userId < 1) {
    return NextResponse.json({ error: "Invalid session" }, { status: 400 });
  }

  const [rows, total] = await Promise.all([
    prisma.userLoginSession.findMany({
      where: { userId },
      orderBy: { loggedInAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        sessionId: true,
        loggedInAt: true,
        loggedOutAt: true,
        ipAddress: true,
        userAgent: true,
      },
    }),
    prisma.userLoginSession.count({ where: { userId } }),
  ]);

  const currentSid = auth.payload.sid ?? null;

  return NextResponse.json({
    sessions: rows.map((r) => ({
      ...r,
      loggedInAt: r.loggedInAt.toISOString(),
      loggedOutAt: r.loggedOutAt?.toISOString() ?? null,
      isCurrentSession: currentSid !== null && r.sessionId === currentSid,
    })),
    page,
    pageSize: PAGE_SIZE,
    total,
    totalPages: Math.ceil(total / PAGE_SIZE) || 1,
  });
}
