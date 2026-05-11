-- Division head acceptance / receive notes, supervisor assignment & enquiry handoff, sample request gate
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "acceptance_reason" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "receive_reason" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "assigned_supervisor_id" INTEGER;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "enquiry_handoff" JSONB;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "head_sample_request_approved_at" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "head_sample_request_approved_by_id" INTEGER;

CREATE INDEX IF NOT EXISTS "Order_assigned_supervisor_id_idx" ON "Order"("assigned_supervisor_id");

DO $$
BEGIN
  ALTER TABLE "Order" ADD CONSTRAINT "Order_assigned_supervisor_id_fkey" FOREIGN KEY ("assigned_supervisor_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "Order" ADD CONSTRAINT "Order_head_sample_request_approved_by_id_fkey" FOREIGN KEY ("head_sample_request_approved_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "order_transfers" ADD COLUMN IF NOT EXISTS "transfer_details" TEXT;
