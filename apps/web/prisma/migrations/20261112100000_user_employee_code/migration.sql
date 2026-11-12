ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "employee_code" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "User_employee_code_key" ON "User"("employee_code");
