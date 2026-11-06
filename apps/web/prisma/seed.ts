import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

/**
 * Demo seed: one Super Admin, a Marketing person and a Sales person, mapped to divisions.
 * Add the remaining divisions and people from the app (Team and Divisions screens).
 * All passwords: shivatex@12345
 */
async function main() {
  const hash = await bcrypt.hash("shivatex@12345", 10);

  const names = ["Lamination", "Coating", "Garments", "Processing"];
  const divisions = await Promise.all(
    names.map((name) => prisma.division.upsert({ where: { name }, update: {}, create: { name } }))
  );

  const people = [
    { email: "superadmin@shivatex.in", name: "Super Admin", role: "SUPER_ADMIN" as const, divs: [] as number[] },
    { email: "marketing@shivatex.in", name: "Anita Rao", role: "MARKETING" as const, divs: [divisions[0].id, divisions[1].id] },
    { email: "sales@shivatex.in", name: "Ravi Kumar", role: "SALES" as const, divs: [divisions[0].id, divisions[1].id, divisions[2].id] },
  ];
  for (const p of people) {
    const user = await prisma.user.upsert({
      where: { email: p.email },
      update: { passwordHash: hash, role: p.role, name: p.name },
      create: { email: p.email, name: p.name, role: p.role, passwordHash: hash },
    });
    for (const divisionId of p.divs) {
      await prisma.userDivision.upsert({
        where: { userId_divisionId: { userId: user.id, divisionId } },
        update: {},
        create: { userId: user.id, divisionId },
      });
    }
    console.log("Seeded", p.role, p.email);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
