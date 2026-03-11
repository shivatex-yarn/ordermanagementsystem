import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash("admin123", 10);
  const superAdmin = await prisma.user.upsert({
    where: { email: "admin@oms.com" },
    update: {},
    create: {
      name: "Super Admin",
      email: "admin@oms.com",
      passwordHash: hash,
      role: "SUPER_ADMIN",
    },
  });
  console.log("Super admin:", superAdmin.email);

  const divisions = await Promise.all([
    prisma.division.upsert({ where: { name: "Operations" }, update: {}, create: { name: "Operations" } }),
    prisma.division.upsert({ where: { name: "Sales" }, update: {}, create: { name: "Sales" } }),
    prisma.division.upsert({ where: { name: "Support" }, update: {}, create: { name: "Support" } }),
  ]);
  console.log("Divisions:", divisions.map((d) => d.name).join(", "));
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
