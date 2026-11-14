import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";
import { withRole } from "@/lib/with-auth";
import { roleLabel } from "@/lib/roles";
import { logAudit } from "@/lib/activity";

export const dynamic = "force-dynamic";

/** Super admin: Excel workbook with the full user list and every audit-log entry recorded for them. */
export async function GET(req: Request) {
  const auth = await withRole(["SUPER_ADMIN"]);
  if (auth.response) return auth.response;

  const [users, logs] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
      select: {
        id: true, name: true, email: true, employeeCode: true, phone: true, role: true, active: true, createdAt: true,
        organization: { select: { name: true } },
        divisions: { select: { division: { select: { name: true } } } },
      },
    }),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" } }),
  ]);

  const byUser = new Map<number, { count: number; last: Date | null }>();
  for (const l of logs) {
    if (l.userId == null) continue;
    const e = byUser.get(l.userId) ?? { count: 0, last: null };
    e.count += 1;
    if (!e.last || l.createdAt > e.last) e.last = l.createdAt;
    byUser.set(l.userId, e);
  }
  const codeOf = new Map(users.map((u) => [u.id, u.employeeCode ?? ""]));
  const fmt = (d: Date | null) => (d ? d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "medium" }) : "");

  const wb = new ExcelJS.Workbook();
  const us = wb.addWorksheet("Users");
  us.columns = [
    { header: "Employee code", key: "code", width: 14 }, { header: "Name", key: "name", width: 26 },
    { header: "Email", key: "email", width: 32 }, { header: "Phone", key: "phone", width: 16 },
    { header: "Role", key: "role", width: 16 }, { header: "Organization", key: "org", width: 26 },
    { header: "Divisions", key: "divs", width: 26 }, { header: "Status", key: "status", width: 10 },
    { header: "Created", key: "created", width: 22 }, { header: "Audit entries", key: "count", width: 14 },
    { header: "Last activity", key: "last", width: 22 },
  ];
  for (const u of users) {
    const a = byUser.get(u.id);
    us.addRow({
      code: u.employeeCode ?? "", name: u.name, email: u.email, phone: u.phone ?? "", role: roleLabel(u.role as never),
      org: u.organization?.name ?? "", divs: u.divisions.map((d) => d.division.name).join("; "),
      status: u.active ? "Active" : "Inactive", created: fmt(u.createdAt), count: a?.count ?? 0, last: fmt(a?.last ?? null),
    });
  }

  const al = wb.addWorksheet("Audit logs");
  al.columns = [
    { header: "When (IST)", key: "when", width: 24 }, { header: "Employee code", key: "code", width: 14 },
    { header: "User", key: "user", width: 26 }, { header: "Role", key: "role", width: 16 },
    { header: "Category", key: "cat", width: 14 }, { header: "Action", key: "action", width: 26 },
    { header: "Record", key: "rec", width: 30 }, { header: "Detail", key: "detail", width: 60 },
    { header: "IP address", key: "ip", width: 18 },
  ];
  for (const l of logs) {
    al.addRow({
      when: fmt(l.createdAt), code: l.userId != null ? codeOf.get(l.userId) ?? "" : "", user: l.userName,
      role: l.userRole ? roleLabel(l.userRole as never) : "", cat: l.category, action: l.action,
      rec: l.entityLabel ?? "", detail: l.detail ?? "", ip: l.ipAddress ?? "",
    });
  }
  for (const ws of [us, al]) {
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };
  }

  await logAudit({ actor: auth.payload, action: "TEAM_EXPORTED", category: "TEAM", detail: `Downloaded user list with ${logs.length} audit entries`, req });
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="team-with-audit-logs-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}
