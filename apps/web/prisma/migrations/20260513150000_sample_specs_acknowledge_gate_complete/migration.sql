-- Sales acknowledgement of approved sample specs; gates division "Complete" when sample was requested.
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "sample_specs_acknowledged_at" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "sample_specs_acknowledged_by_id" INTEGER;

DO $$
BEGIN
  ALTER TABLE "Order" ADD CONSTRAINT "Order_sample_specs_acknowledged_by_id_fkey" FOREIGN KEY ("sample_specs_acknowledged_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Grandfather in-flight rows: if specs were already head-approved, treat submitter as having acknowledged at approval time.
UPDATE "Order"
SET
  "sample_specs_acknowledged_at" = "sample_approved_at",
  "sample_specs_acknowledged_by_id" = "created_by_id"
WHERE "sample_requested" = true
  AND "sample_approved_at" IS NOT NULL
  AND "sample_specs_acknowledged_at" IS NULL;
