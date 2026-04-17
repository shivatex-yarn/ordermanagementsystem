-- Add Division Head rejection fields to sla_breaches.
-- These columns are referenced by the Prisma schema but were missing in the DB.

ALTER TABLE "sla_breaches"
  ADD COLUMN IF NOT EXISTS "head_rejection_message" TEXT,
  ADD COLUMN IF NOT EXISTS "head_rejected_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "head_rejected_by_id" INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sla_breaches_head_rejected_by_id_fkey'
  ) THEN
    ALTER TABLE "sla_breaches"
      ADD CONSTRAINT "sla_breaches_head_rejected_by_id_fkey"
      FOREIGN KEY ("head_rejected_by_id") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "sla_breaches_head_rejected_at_idx"
  ON "sla_breaches" ("head_rejected_at");

