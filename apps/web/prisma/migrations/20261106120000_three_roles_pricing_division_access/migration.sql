-- Keep a copy of who worked in which division before the old columns/tables go away.
CREATE TEMP TABLE _old_user_div AS
  SELECT id AS user_id, division_id FROM "User" WHERE division_id IS NOT NULL
  UNION
  SELECT user_id, division_id FROM division_managers;

-- Roles that no longer exist (manager, division head, supervisor, ASM) become inactive
-- Marketing users; Super Admin re-adds the right people. USER (sales/marketing) stays active.
UPDATE "User" SET active = false WHERE role::text NOT IN ('SUPER_ADMIN', 'MANAGING_DIRECTOR', 'ACCOUNTS', 'USER');

-- Requested: remove all existing enquiries. Child rows (timeline, audit, transfers, SLA breaches,
-- comments) cascade. THIS IS IRREVERSIBLE once the migration runs.
DELETE FROM "Order";

-- CreateEnum
CREATE TYPE "AccessRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum
BEGIN;
CREATE TYPE "Role_new" AS ENUM ('SUPER_ADMIN', 'MANAGING_DIRECTOR', 'ACCOUNTS', 'MARKETING', 'SALES');
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role_new" USING (CASE "role"::text WHEN 'SUPER_ADMIN' THEN 'SUPER_ADMIN' WHEN 'MANAGING_DIRECTOR' THEN 'MANAGING_DIRECTOR' WHEN 'ACCOUNTS' THEN 'ACCOUNTS' ELSE 'MARKETING' END::"Role_new");
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "Role_old";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'MARKETING';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "OrderStatus_new" AS ENUM ('PLACED', 'PRICED', 'CLOSED', 'CANCELLED');
ALTER TABLE "Order" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Order" ALTER COLUMN "status" TYPE "OrderStatus_new" USING (CASE "status"::text WHEN 'COMPLETED' THEN 'CLOSED' WHEN 'CANCELLED' THEN 'CANCELLED' WHEN 'REJECTED' THEN 'CANCELLED' ELSE 'PLACED' END::"OrderStatus_new");
ALTER TYPE "OrderStatus" RENAME TO "OrderStatus_old";
ALTER TYPE "OrderStatus_new" RENAME TO "OrderStatus";
DROP TYPE "OrderStatus_old";
ALTER TABLE "Order" ALTER COLUMN "status" SET DEFAULT 'PLACED';
COMMIT;

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_division_id_fkey";

-- DropForeignKey
ALTER TABLE "division_managers" DROP CONSTRAINT "division_managers_division_id_fkey";

-- DropForeignKey
ALTER TABLE "division_managers" DROP CONSTRAINT "division_managers_user_id_fkey";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_current_division_id_fkey";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_previous_division_id_fkey";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_accepted_by_id_fkey";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_rejected_by_id_fkey";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_received_by_id_fkey";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_completed_by_id_fkey";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_cancelled_by_id_fkey";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_sample_approved_by_id_fkey";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_assigned_supervisor_id_fkey";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_head_sample_request_approved_by_id_fkey";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_sample_specs_acknowledged_by_id_fkey";

-- DropForeignKey
ALTER TABLE "order_transfers" DROP CONSTRAINT "order_transfers_order_id_fkey";

-- DropForeignKey
ALTER TABLE "order_transfers" DROP CONSTRAINT "order_transfers_from_division_id_fkey";

-- DropForeignKey
ALTER TABLE "order_transfers" DROP CONSTRAINT "order_transfers_to_division_id_fkey";

-- DropForeignKey
ALTER TABLE "order_transfers" DROP CONSTRAINT "order_transfers_transferred_by_id_fkey";

-- DropForeignKey
ALTER TABLE "order_rejections" DROP CONSTRAINT "order_rejections_order_id_fkey";

-- DropForeignKey
ALTER TABLE "order_rejections" DROP CONSTRAINT "order_rejections_division_id_fkey";

-- DropForeignKey
ALTER TABLE "order_rejections" DROP CONSTRAINT "order_rejections_rejected_by_id_fkey";

-- DropForeignKey
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_order_id_fkey";

-- DropForeignKey
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_user_id_fkey";

-- DropForeignKey
ALTER TABLE "sla_breaches" DROP CONSTRAINT "sla_breaches_order_id_fkey";

-- DropForeignKey
ALTER TABLE "sla_breaches" DROP CONSTRAINT "sla_breaches_division_id_fkey";

-- DropForeignKey
ALTER TABLE "sla_breaches" DROP CONSTRAINT "sla_breaches_head_rejected_by_id_fkey";

-- DropForeignKey
ALTER TABLE "sla_delay_reasons" DROP CONSTRAINT "sla_delay_reasons_breach_id_fkey";

-- DropForeignKey
ALTER TABLE "sla_delay_reasons" DROP CONSTRAINT "sla_delay_reasons_user_id_fkey";

-- DropForeignKey
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_user_id_fkey";

-- DropForeignKey
ALTER TABLE "order_comments" DROP CONSTRAINT "order_comments_order_id_fkey";

-- DropForeignKey
ALTER TABLE "order_comments" DROP CONSTRAINT "order_comments_user_id_fkey";

-- DropForeignKey
ALTER TABLE "order_edit_history" DROP CONSTRAINT "order_edit_history_order_id_fkey";

-- DropForeignKey
ALTER TABLE "order_edit_history" DROP CONSTRAINT "order_edit_history_user_id_fkey";

-- DropForeignKey
ALTER TABLE "multi_division_access_requests" DROP CONSTRAINT "multi_division_access_requests_user_id_fkey";

-- DropForeignKey
ALTER TABLE "multi_division_access_requests" DROP CONSTRAINT "multi_division_access_requests_approved_by_id_fkey";

-- DropForeignKey
ALTER TABLE "multi_division_access_request_divisions" DROP CONSTRAINT "multi_division_access_request_divisions_request_id_fkey";

-- DropForeignKey
ALTER TABLE "multi_division_access_request_divisions" DROP CONSTRAINT "multi_division_access_request_divisions_division_id_fkey";

-- DropIndex
DROP INDEX "Order_current_division_id_idx";

-- DropIndex
DROP INDEX "Order_sla_deadline_idx";

-- DropIndex
DROP INDEX "Order_createdAt_idx";

-- DropIndex
DROP INDEX "Order_created_by_id_createdAt_idx";

-- DropIndex
DROP INDEX "Order_current_division_id_createdAt_idx";

-- DropIndex
DROP INDEX "Order_priority_status_idx";

-- DropIndex
DROP INDEX "Order_status_sla_deadline_idx";

-- DropIndex
DROP INDEX "Order_handoff_sla_deadline_idx";

-- DropIndex
DROP INDEX "Order_head_sample_approval_sla_deadline_idx";

-- DropIndex
DROP INDEX "Order_sample_details_sla_deadline_idx";

-- DropIndex
DROP INDEX "Order_sample_approval_sla_deadline_idx";

-- DropIndex
DROP INDEX "Order_shipment_sla_deadline_idx";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "division_id",
ADD COLUMN     "phone" TEXT,
ALTER COLUMN "role" SET DEFAULT 'MARKETING';

-- AlterTable
ALTER TABLE "Order"
  ADD COLUMN     "assigned_to_id" INTEGER,
  ADD COLUMN     "client_feedback" TEXT,
  ADD COLUMN     "client_feedback_at" TIMESTAMP(3),
  ADD COLUMN     "client_response" TEXT,
  ADD COLUMN     "closed_at" TIMESTAMP(3),
  ADD COLUMN     "delivery_time" TEXT,
  ADD COLUMN     "division_id" INTEGER,
  ADD COLUMN     "enquiry_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN     "is_sample" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN     "payment_terms" TEXT,
  ADD COLUMN     "price_per_unit" DECIMAL(14,2),
  ADD COLUMN     "price_unit" TEXT,
  ADD COLUMN     "priced_at" TIMESTAMP(3),
  ADD COLUMN     "priced_by_id" INTEGER,
  ADD COLUMN     "pricing_notes" TEXT,
  ADD COLUMN     "product_details" TEXT,
  ADD COLUMN     "quantity" TEXT,
  ADD COLUMN     "sample_courier_name" TEXT,
  ADD COLUMN     "sample_sent_at" TIMESTAMP(3),
  ADD COLUMN     "sample_tracking_id" TEXT;

-- Carry data across to the new columns
UPDATE "Order" SET
  division_id = current_division_id,
  enquiry_date = COALESCE(customer_order_date, "createdAt"),
  product_details = description,
  is_sample = sample_requested,
  sample_sent_at = sample_shipped_at,
  sample_courier_name = courier_name,
  sample_tracking_id = tracking_id,
  sample_remarks = COALESCE(sample_remarks, sample_details),
  client_feedback = COALESCE(customer_feedback, sales_feedback),
  client_feedback_at = COALESCE(customer_feedback_at, sales_feedback_at),
  client_response = customer_response_status,
  closed_at = completed_at,
  customer_name = COALESCE(customer_name, company_name, 'Unknown');

ALTER TABLE "Order"
  DROP COLUMN "accepted_by_id",
  DROP COLUMN "assigned_supervisor_id",
  DROP COLUMN "cancelled_at",
  DROP COLUMN "cancelled_by_id",
  DROP COLUMN "completed_at",
  DROP COLUMN "completed_by_id",
  DROP COLUMN "courier_name",
  DROP COLUMN "current_division_id",
  DROP COLUMN "custom_fields",
  DROP COLUMN "customer_feedback",
  DROP COLUMN "customer_feedback_at",
  DROP COLUMN "customer_feedback_remarks",
  DROP COLUMN "customer_id",
  DROP COLUMN "customer_order_date",
  DROP COLUMN "customer_response_status",
  DROP COLUMN "description",
  DROP COLUMN "enquiry_handoff",
  DROP COLUMN "existing_product_ref",
  DROP COLUMN "handoff_sla_deadline",
  DROP COLUMN "handover_person_name",
  DROP COLUMN "handover_person_phone",
  DROP COLUMN "handover_person_type",
  DROP COLUMN "head_sample_approval_sla_deadline",
  DROP COLUMN "head_sample_request_approved_at",
  DROP COLUMN "head_sample_request_approved_by_id",
  DROP COLUMN "new_dev_plan",
  DROP COLUMN "new_product_specs",
  DROP COLUMN "previous_division_id",
  DROP COLUMN "priority",
  DROP COLUMN "product_kind",
  DROP COLUMN "receive_reason",
  DROP COLUMN "received_by_id",
  DROP COLUMN "rejected_by_id",
  DROP COLUMN "rejection_count",
  DROP COLUMN "sales_feedback",
  DROP COLUMN "sales_feedback_at",
  DROP COLUMN "sample_approval_sla_deadline",
  DROP COLUMN "sample_approved_at",
  DROP COLUMN "sample_approved_by_id",
  DROP COLUMN "sample_delivery_date",
  DROP COLUMN "sample_details",
  DROP COLUMN "sample_details_sla_deadline",
  DROP COLUMN "sample_proof_url",
  DROP COLUMN "sample_quantity",
  DROP COLUMN "sample_received_at",
  DROP COLUMN "sample_request_notes",
  DROP COLUMN "sample_requested",
  DROP COLUMN "sample_shipped_at",
  DROP COLUMN "sample_shipped_by_courier",
  DROP COLUMN "sample_specs_acknowledged_at",
  DROP COLUMN "sample_specs_acknowledged_by_id",
  DROP COLUMN "sample_weight",
  DROP COLUMN "shipment_sla_deadline",
  DROP COLUMN "sla_deadline",
  DROP COLUMN "tracking_id",
  DROP COLUMN "transfer_count",
  ALTER COLUMN "division_id" SET NOT NULL,
  ALTER COLUMN "customer_name" SET NOT NULL;

-- DropTable
DROP TABLE "division_managers";

-- DropTable
DROP TABLE "order_transfers";

-- DropTable
DROP TABLE "order_rejections";

-- DropTable
DROP TABLE "audit_logs";

-- DropTable
DROP TABLE "sla_breaches";

-- DropTable
DROP TABLE "sla_delay_reasons";

-- DropTable
DROP TABLE "notifications";

-- DropTable
DROP TABLE "order_comments";

-- DropTable
DROP TABLE "order_edit_history";

-- DropTable
DROP TABLE "multi_division_access_requests";

-- DropTable
DROP TABLE "multi_division_access_request_divisions";

-- DropEnum
DROP TYPE "ProductKind";

-- DropEnum
DROP TYPE "EnquiryPriority";

-- DropEnum
DROP TYPE "MultiDivisionRequestStatus";

-- CreateTable
CREATE TABLE "user_divisions" (
    "user_id" INTEGER NOT NULL,
    "division_id" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_divisions_pkey" PRIMARY KEY ("user_id","division_id")
);

-- CreateTable
CREATE TABLE "division_access_requests" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "division_id" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "AccessRequestStatus" NOT NULL DEFAULT 'PENDING',
    "decided_by_id" INTEGER,
    "decided_at" TIMESTAMP(3),
    "decision_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "division_access_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "division_access_requests_user_id_idx" ON "division_access_requests"("user_id");

-- CreateIndex
CREATE INDEX "division_access_requests_status_idx" ON "division_access_requests"("status");

-- CreateIndex
CREATE INDEX "Order_division_id_idx" ON "Order"("division_id");

-- CreateIndex
CREATE INDEX "Order_assigned_to_id_idx" ON "Order"("assigned_to_id");

-- CreateIndex
CREATE INDEX "Order_enquiry_date_idx" ON "Order"("enquiry_date" DESC);

-- CreateIndex
CREATE INDEX "Order_status_enquiry_date_idx" ON "Order"("status", "enquiry_date" DESC);

-- AddForeignKey
ALTER TABLE "user_divisions" ADD CONSTRAINT "user_divisions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_divisions" ADD CONSTRAINT "user_divisions_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "Division"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "division_access_requests" ADD CONSTRAINT "division_access_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "division_access_requests" ADD CONSTRAINT "division_access_requests_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "division_access_requests" ADD CONSTRAINT "division_access_requests_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "Division"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "Division"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_priced_by_id_fkey" FOREIGN KEY ("priced_by_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Map people to the divisions they used to belong to
INSERT INTO user_divisions (user_id, division_id, "createdAt")
SELECT user_id, division_id, CURRENT_TIMESTAMP FROM _old_user_div
ON CONFLICT DO NOTHING;
DROP TABLE _old_user_div;
