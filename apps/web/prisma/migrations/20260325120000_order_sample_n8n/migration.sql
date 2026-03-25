-- Sample workflow + n8n integration support
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "sample_requested" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "sample_request_notes" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "sample_details" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "sample_quantity" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "sample_approved_at" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "sample_approved_by_id" INTEGER;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "sample_shipped_at" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "courier_name" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "tracking_id" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "sales_feedback" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "sales_feedback_at" TIMESTAMP(3);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Order_sample_approved_by_id_fkey'
  ) THEN
    ALTER TABLE "Order" ADD CONSTRAINT "Order_sample_approved_by_id_fkey"
      FOREIGN KEY ("sample_approved_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
