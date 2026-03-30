-- Creator-initiated cancellation (withdraw enquiry) + audit / notifications
ALTER TYPE "OrderStatus" ADD VALUE 'CANCELLED';

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "cancellation_reason" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "cancelled_by_id" INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Order_cancelled_by_id_fkey'
  ) THEN
    ALTER TABLE "Order" ADD CONSTRAINT "Order_cancelled_by_id_fkey"
      FOREIGN KEY ("cancelled_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
