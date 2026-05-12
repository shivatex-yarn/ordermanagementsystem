-- Enquiry Management Application — workflow fields, enums, timeline table.
-- Adds: ProductKind / EnquiryPriority enums; product/feedback/sample-receipt columns on Order;
-- SLA delay-reason columns + table; unified EnquiryTimelineEvent table.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ProductKind') THEN
    CREATE TYPE "ProductKind" AS ENUM ('EXISTING', 'NEW');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EnquiryPriority') THEN
    CREATE TYPE "EnquiryPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'CRITICAL');
  END IF;
END $$;

-- Order: enquiry classification + customer feedback + sample receipt + priority.
ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "product_kind"          "ProductKind",
  ADD COLUMN IF NOT EXISTS "existing_product_ref"  TEXT,
  ADD COLUMN IF NOT EXISTS "new_product_specs"     TEXT,
  ADD COLUMN IF NOT EXISTS "sample_received_at"    TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "customer_feedback"     TEXT,
  ADD COLUMN IF NOT EXISTS "customer_feedback_at"  TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "priority"              "EnquiryPriority" NOT NULL DEFAULT 'NORMAL';

CREATE INDEX IF NOT EXISTS "Order_priority_status_idx" ON "Order" ("priority", "status");
CREATE INDEX IF NOT EXISTS "Order_status_sla_deadline_idx" ON "Order" ("status", "sla_deadline");

-- SLA breaches: login-time delay reason (denormalised latest snapshot).
ALTER TABLE "sla_breaches"
  ADD COLUMN IF NOT EXISTS "delay_reason_text" TEXT,
  ADD COLUMN IF NOT EXISTS "delay_reason_at"   TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "sla_breaches_division_id_resolved_at_idx"
  ON "sla_breaches" ("division_id", "resolved_at");

-- Forensic per-submission record of delay reasons.
CREATE TABLE IF NOT EXISTS "sla_delay_reasons" (
  "id"          SERIAL          PRIMARY KEY,
  "breach_id"   INTEGER         NOT NULL,
  "user_id"     INTEGER         NOT NULL,
  "reason_text" TEXT            NOT NULL,
  "created_at"  TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sla_delay_reasons_breach_id_fkey'
  ) THEN
    ALTER TABLE "sla_delay_reasons"
      ADD CONSTRAINT "sla_delay_reasons_breach_id_fkey"
      FOREIGN KEY ("breach_id") REFERENCES "sla_breaches"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sla_delay_reasons_user_id_fkey'
  ) THEN
    ALTER TABLE "sla_delay_reasons"
      ADD CONSTRAINT "sla_delay_reasons_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "sla_delay_reasons_breach_id_idx" ON "sla_delay_reasons" ("breach_id");
CREATE INDEX IF NOT EXISTS "sla_delay_reasons_user_id_idx"   ON "sla_delay_reasons" ("user_id");

-- Unified enquiry workflow timeline. Append-only.
CREATE TABLE IF NOT EXISTS "enquiry_timeline_events" (
  "id"         SERIAL       PRIMARY KEY,
  "order_id"   INTEGER      NOT NULL,
  "type"       TEXT         NOT NULL,
  "title"      TEXT         NOT NULL,
  "detail"     TEXT,
  "actor_id"   INTEGER,
  "metadata"   JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'enquiry_timeline_events_order_id_fkey'
  ) THEN
    ALTER TABLE "enquiry_timeline_events"
      ADD CONSTRAINT "enquiry_timeline_events_order_id_fkey"
      FOREIGN KEY ("order_id") REFERENCES "Order"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'enquiry_timeline_events_actor_id_fkey'
  ) THEN
    ALTER TABLE "enquiry_timeline_events"
      ADD CONSTRAINT "enquiry_timeline_events_actor_id_fkey"
      FOREIGN KEY ("actor_id") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "enquiry_timeline_events_order_created_idx"
  ON "enquiry_timeline_events" ("order_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "enquiry_timeline_events_created_idx"
  ON "enquiry_timeline_events" ("created_at" DESC);
