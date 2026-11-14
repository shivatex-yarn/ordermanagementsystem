CREATE TABLE IF NOT EXISTS "organizations" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "organizations_name_key" ON "organizations"("name");
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "organization_id" INTEGER;
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_organization_id_fkey";
ALTER TABLE "User" ADD CONSTRAINT "User_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
