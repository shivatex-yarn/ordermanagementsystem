import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";
import { withRole } from "@/lib/with-auth";
import { roleLabel } from "@/lib/roles";
import { auditWhere } from "@/lib/audit-filter";
import { logAudit } from "@/lib/activity";

export const dynamic = "force-dynamic";

/** Super admin: Excel of the audit log with the same filters as the screen (all pages, not just the one showing). */
export async function GET(req: Request) {
  const auth = await withRole(["SUPER_ADMIN"]);
  if (auth.response) return auth.response;
  const sp = new URL(req.url).searchParams;
  const logs = await prisma.auditLog.findMany({ where: auditWhere(sp), orderBy: { createdAt: "desc" } });

  const ids = [...new Set(logs.map((l) => l.userId).filter((v): v is number => v != null))];
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, employeeCode: true } });
  const codeOf = new Map(users.map((u) => [u.id, u.employeeCode ?? ""]));
  const fmt = (d: Date) => d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "medium" });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Audit log");
  ws.columns = [
    { header: "When (IST)", key: "when", width: 24 }, { header: "Employee code", key: "code", width: 14 },
    { header: "Person", key: "user", width: 26 }, { header: "Role", key: "role", width: 16 },
    { header: "Category", key: "cat", width: 14 }, { header: "Action", key: "action", width: 26 },
    { header: "On", key: "rec", width: 30 }, { header: "Detail", key: "detail", width: 60 },
    { header: "IP address", key: "ip", width: 18 },
  ];
  for (const l of logs) {
    ws.addRow({
      when: fmt(l.createdAt), code: l.userId != null ? codeOf.get(l.userId) ?? "" : "", user: l.userName,
      role: l.userRole ? roleLabel(l.userRole as never) : "", cat: l.category,
      action: l.action.toLowerCase().replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()),
      rec: l.entityLabel ?? "", detail: l.detail ?? "", ip: l.ipAddress ?? "",
    });
  }
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };

  await logAudit({ actor: auth.payload, action: "AUDIT_EXPORTED", category: "TEAM", detail: `Downloaded ${logs.length} audit entries`, req });
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}
