-- Stage-specific SLA deadline columns on orders
ALTER TABLE "orders"
  ADD COLUMN "handoff_sla_deadline"              TIMESTAMPTZ,
  ADD COLUMN "head_sample_approval_sla_deadline" TIMESTAMPTZ,
  ADD COLUMN "sample_details_sla_deadline"       TIMESTAMPTZ,
  ADD COLUMN "sample_approval_sla_deadline"      TIMESTAMPTZ,
  ADD COLUMN "shipment_sla_deadline"             TIMESTAMPTZ;

-- Indexes for breach-job queries (only rows with a deadline set matter)
CREATE INDEX "orders_handoff_sla_deadline_idx"
  ON "orders"("handoff_sla_deadline")
  WHERE "handoff_sla_deadline" IS NOT NULL;

CREATE INDEX "orders_head_sample_approval_sla_deadline_idx"
  ON "orders"("head_sample_approval_sla_deadline")
  WHERE "head_sample_approval_sla_deadline" IS NOT NULL;

CREATE INDEX "orders_sample_details_sla_deadline_idx"
  ON "orders"("sample_details_sla_deadline")
  WHERE "sample_details_sla_deadline" IS NOT NULL;

CREATE INDEX "orders_sample_approval_sla_deadline_idx"
  ON "orders"("sample_approval_sla_deadline")
  WHERE "sample_approval_sla_deadline" IS NOT NULL;

CREATE INDEX "orders_shipment_sla_deadline_idx"
  ON "orders"("shipment_sla_deadline")
  WHERE "shipment_sla_deadline" IS NOT NULL;

-- Breach type column so UI/reports can show which stage was missed
ALTER TABLE "sla_breaches"
  ADD COLUMN "breach_type" TEXT NOT NULL DEFAULT 'PLACEMENT';
