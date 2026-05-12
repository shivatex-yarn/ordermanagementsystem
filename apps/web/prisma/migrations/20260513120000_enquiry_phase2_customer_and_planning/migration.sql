-- Phase 2: customer info (mandatory at creation), New Development planning popup fields,
-- sample dispatch fields, customer response, and product classification.
-- GST certificate stored as inline JSON per user request — no external object storage.

ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "customer_id"                    TEXT,
  ADD COLUMN IF NOT EXISTS "customer_name"                  TEXT,
  ADD COLUMN IF NOT EXISTS "customer_phone"                 TEXT,
  ADD COLUMN IF NOT EXISTS "customer_gst_number"            TEXT,
  ADD COLUMN IF NOT EXISTS "customer_gst_cert"              JSONB,
  ADD COLUMN IF NOT EXISTS "customer_order_date"            TIMESTAMP(3),

  ADD COLUMN IF NOT EXISTS "new_dev_description"            TEXT,
  ADD COLUMN IF NOT EXISTS "new_dev_resources"              TEXT,
  ADD COLUMN IF NOT EXISTS "new_dev_rand_d"                 TEXT,
  ADD COLUMN IF NOT EXISTS "new_dev_timeline"               TEXT,
  ADD COLUMN IF NOT EXISTS "new_dev_notes"                  TEXT,
  ADD COLUMN IF NOT EXISTS "new_dev_completion_duration"    TEXT,
  ADD COLUMN IF NOT EXISTS "new_dev_why_needed"             TEXT,
  ADD COLUMN IF NOT EXISTS "planning_started_at"            TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "planning_completed_at"          TIMESTAMP(3),

  ADD COLUMN IF NOT EXISTS "sample_type"                    TEXT,
  ADD COLUMN IF NOT EXISTS "sample_dispatch_method"         TEXT,
  ADD COLUMN IF NOT EXISTS "sample_dispatch_date"           TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "sample_expected_delivery_date"  TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "sample_internal_remarks"        TEXT,

  ADD COLUMN IF NOT EXISTS "sample_received_at"             TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "customer_feedback"              TEXT,
  ADD COLUMN IF NOT EXISTS "customer_feedback_at"           TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "customer_response_status"       TEXT,
  ADD COLUMN IF NOT EXISTS "customer_additional_remarks"    TEXT,

  ADD COLUMN IF NOT EXISTS "product_kind"                   TEXT,
  ADD COLUMN IF NOT EXISTS "existing_product_ref"           TEXT,
  ADD COLUMN IF NOT EXISTS "existing_sample_info"           TEXT,
  ADD COLUMN IF NOT EXISTS "existing_internal_remarks"      TEXT;

-- Helpful indexes for dashboards and customer lookup.
CREATE INDEX IF NOT EXISTS "Order_customer_id_idx"        ON "Order" ("customer_id");
CREATE INDEX IF NOT EXISTS "Order_customer_name_idx"      ON "Order" ("customer_name");
CREATE INDEX IF NOT EXISTS "Order_planning_completed_at"  ON "Order" ("planning_completed_at");
CREATE INDEX IF NOT EXISTS "Order_product_kind_status"    ON "Order" ("product_kind", "status");
