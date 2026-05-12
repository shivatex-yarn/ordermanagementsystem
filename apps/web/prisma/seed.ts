import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

/**
 * Demo seed for the Enquiry Management Application.
 *
 * Creates one user per role (excluding USER → multiple) and three divisions, with
 * division-head + supervisor mappings. Passwords are all `shivatex@12345`.
 */
async function main() {
  const password = "shivatex@12345";
  const hash = await bcrypt.hash(password, 10);

  // Divisions
  const divisions = await Promise.all([
    prisma.division.upsert({ where: { name: "Operations" }, update: {}, create: { name: "Operations" } }),
    prisma.division.upsert({ where: { name: "Sales" }, update: {}, create: { name: "Sales" } }),
    prisma.division.upsert({ where: { name: "Support" }, update: {}, create: { name: "Support" } }),
  ]);
  console.log("Divisions:", divisions.map((d) => d.name).join(", "));
  const [opsDiv, salesDiv, supportDiv] = divisions;

  // Users — one per role
  type SeedUser = {
    email: string;
    name: string;
    role:
      | "SUPER_ADMIN"
      | "MANAGING_DIRECTOR"
      | "ACCOUNTS"
      | "DIVISION_HEAD"
      | "MANAGER"
      | "SUPERVISOR"
      | "ASM"
      | "USER";
    divisionId?: number;
  };
  const seedUsers: SeedUser[] = [
    { email: "superadmin@shivatex.in", name: "Super Admin", role: "SUPER_ADMIN" },
    { email: "md@shivatex.in", name: "Anita Rao (MD)", role: "MANAGING_DIRECTOR" },
    { email: "accounts@shivatex.in", name: "Accounts Team", role: "ACCOUNTS" },
    { email: "head.ops@shivatex.in", name: "Ravi Kumar (Ops Head)", role: "DIVISION_HEAD", divisionId: opsDiv.id },
    { email: "head.sales@shivatex.in", name: "Priya Menon (Sales Head)", role: "DIVISION_HEAD", divisionId: salesDiv.id },
    { email: "supervisor.ops@shivatex.in", name: "Mahesh Iyer (Supervisor)", role: "SUPERVISOR", divisionId: opsDiv.id },
    { email: "asm.sales@shivatex.in", name: "Karthik Patel (ASM)", role: "ASM", divisionId: salesDiv.id },
    { email: "sales1@shivatex.in", name: "Neha Singh (Sales)", role: "USER", divisionId: salesDiv.id },
    { email: "sales2@shivatex.in", name: "Vikram Shah (Sales)", role: "USER", divisionId: supportDiv.id },
  ];
  for (const u of seedUsers) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { passwordHash: hash, role: u.role, name: u.name, divisionId: u.divisionId ?? null },
      create: {
        name: u.name,
        email: u.email,
        passwordHash: hash,
        role: u.role,
        divisionId: u.divisionId ?? null,
      },
    });
    if (u.divisionId && (u.role === "DIVISION_HEAD" || u.role === "MANAGER")) {
      await prisma.divisionManager.upsert({
        where: { divisionId_userId: { divisionId: u.divisionId, userId: user.id } },
        update: {},
        create: { divisionId: u.divisionId, userId: user.id },
      });
    }
    console.log("Seeded user:", u.email, "→", u.role);
  }

  console.log("Done. All passwords:", password);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
