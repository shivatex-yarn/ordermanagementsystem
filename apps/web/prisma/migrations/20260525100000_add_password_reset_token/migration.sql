-- AlterTable: add password reset fields to "User" (IF NOT EXISTS = safe to re-run)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'User' AND column_name = 'password_reset_token'
  ) THEN
    ALTER TABLE "User" ADD COLUMN "password_reset_token" TEXT UNIQUE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'User' AND column_name = 'password_reset_expires_at'
  ) THEN
    ALTER TABLE "User" ADD COLUMN "password_reset_expires_at" TIMESTAMP(3);
  END IF;
END $$;
