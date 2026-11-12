import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/activity";
import { withRole } from "@/lib/with-auth";
import { ASSIGNABLE_ROLES } from "@/lib/roles";

const MAX_ROWS = 200;

const bodySchema = z.object({
  rows: z
    .array(
      z.object({
        employeeCode: z.string().default(""),
        name: z.string().default(""),
        email: z.string().default(""),
        phone: z.string().default(""),
        role: z.string().default(""),
        password: z.string().default(""),
        divisions: z.string().default(""),
      })
    )
    .min(1, "The file has no rows")
    .max(MAX_ROWS, `Upload at most ${MAX_ROWS} people at a time`),
});

type RowResult = { row: number; name: string; ok: boolean; error?: string };

/** Super admin: add many people at once from the bulk-upload template. Valid rows are created, invalid ones are reported. */
export async function POST(req: Request) {
  const auth = await withRole(["SUPER_ADMIN"]);
  if (auth.response) return auth.response;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid file" }, { status: 400 });
  }

  const [divisions, existing] = await Promise.all([
    prisma.division.findMany({ where: { active: true }, select: { id: true, name: true } }),
    prisma.user.findMany({ select: { email: true, employeeCode: true } }),
  ]);
  const divByName = new Map(divisions.map((d) => [d.name.trim().toLowerCase(), d.id]));
  const roleByText = new Map<string, string>();
  for (const r of ASSIGNABLE_ROLES) {
    roleByText.set(r.value.toLowerCase(), r.value);
    roleByText.set(r.label.toLowerCase(), r.value);
  }
  const takenEmails = new Set(existing.map((u) => u.email.toLowerCase()));
  const takenCodes = new Set(existing.map((u) => u.employeeCode?.toLowerCase()).filter(Boolean) as string[]);

  const results: RowResult[] = [];
  let created = 0;

  for (let i = 0; i < parsed.data.rows.length; i++) {
    const r = parsed.data.rows[i];
    const rowNo = i + 2; // row 1 of the sheet is the header
    const name = r.name.trim();
    const email = r.email.trim().toLowerCase();
    const code = r.employeeCode.trim();
    const fail = (error: string) => results.push({ row: rowNo, name: name || email || `Row ${rowNo}`, ok: false, error });

    if (!name) { fail("Full name is missing"); continue; }
    if (!z.string().email().safeParse(email).success) { fail("Email is missing or not valid"); continue; }
    if (takenEmails.has(email)) { fail("That email is already registered"); continue; }
    if (code.length > 40) { fail("Employee code is too long (40 characters max)"); continue; }
    if (code && takenCodes.has(code.toLowerCase())) { fail(`Employee code ${code} is already used`); continue; }
    if (r.password.length < 8) { fail("Password must be at least 8 characters"); continue; }
    const role = roleByText.get(r.role.trim().toLowerCase() || "marketing");
    if (!role) { fail(`Role "${r.role}" isn't valid. Use Marketing, Sales, Managing director or Accounts`); continue; }

    let divisionIds: number[] = [];
    if (role === "MARKETING" || role === "SALES") {
      const names = r.divisions.split(/[;,|]/).map((s) => s.trim()).filter(Boolean);
      const unknown = names.filter((n) => !divByName.has(n.toLowerCase()));
      if (unknown.length) { fail(`Unknown division: ${unknown.join(", ")}`); continue; }
      divisionIds = [...new Set(names.map((n) => divByName.get(n.toLowerCase())!))];
    }

    try {
      await prisma.user.create({
        data: {
          name,
          email,
          employeeCode: code || null,
          phone: r.phone.trim() || null,
          role: role as "MARKETING" | "SALES" | "MANAGING_DIRECTOR" | "ACCOUNTS",
          passwordHash: await bcrypt.hash(r.password, 10),
          divisions: { create: divisionIds.map((divisionId) => ({ divisionId })) },
        },
      });
      takenEmails.add(email);
      if (code) takenCodes.add(code.toLowerCase());
      created++;
      results.push({ row: rowNo, name, ok: true });
    } catch {
      fail("Could not be saved. Check the values and try again");
    }
  }

  const failed = results.filter((x) => !x.ok);
  await logAudit({ actor: auth.payload, action: "TEAM_BULK_UPLOAD", category: "TEAM", entityType: "User", detail: `${created} added, ${failed.length} skipped`, req });
  return NextResponse.json({ created, failed }, { status: created > 0 ? 201 : 200 });
}
