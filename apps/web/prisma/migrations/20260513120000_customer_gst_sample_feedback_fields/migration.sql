-- AddColumn customer identity fields
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "customer_name" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "customer_phone" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "gst_number" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "gst_copy_url" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "customer_order_date" TIMESTAMP(3);

-- AddColumn sample delivery/remarks fields
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "sample_delivery_date" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "sample_remarks" TEXT;

-- AddColumn customer feedback fields
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "customer_response_status" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "customer_feedback_remarks" TEXT;
