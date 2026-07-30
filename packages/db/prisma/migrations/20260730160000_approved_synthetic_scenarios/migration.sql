-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "commerce";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "operations";

-- CreateEnum
CREATE TYPE "commerce"."order_status" AS ENUM ('CONFIRMED', 'PROCESSING');

-- CreateEnum
CREATE TYPE "commerce"."payment_status" AS ENUM ('SUCCEEDED', 'PROCESSING', 'FAILED');

-- CreateEnum
CREATE TYPE "commerce"."inventory_source_system" AS ENUM ('WAREHOUSE_SYSTEM', 'COMMERCE_SYSTEM');

-- CreateEnum
CREATE TYPE "commerce"."fulfilment_status" AS ENUM ('PENDING', 'PROCESSING', 'ON_HOLD', 'FAILED');

-- CreateEnum
CREATE TYPE "commerce"."fulfilment_hold_reason" AS ENUM ('INVENTORY_OUT_OF_STOCK', 'OTHER');

-- CreateEnum
CREATE TYPE "commerce"."fulfilment_event_type" AS ENUM ('FULFILMENT_CREATED', 'FULFILMENT_CREATION_FAILED', 'PROCESSING_STARTED', 'INVENTORY_HOLD_ADDED', 'SHIPMENT_LABEL_CREATION_FAILED');

-- CreateEnum
CREATE TYPE "commerce"."fulfilment_event_status" AS ENUM ('SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "commerce"."shipment_status" AS ENUM ('CREATED', 'IN_TRANSIT', 'DELIVERED');

-- CreateEnum
CREATE TYPE "operations"."investigation_status" AS ENUM ('RUNNING', 'COMPLETED', 'NEEDS_MORE_INFO', 'FAILED');

-- CreateEnum
CREATE TYPE "operations"."evidence_status" AS ENUM ('COMPLETE', 'MISSING', 'CONFLICTING');

-- CreateEnum
CREATE TYPE "operations"."diagnosis_code" AS ENUM ('ASSIGNED_WAREHOUSE_OUT_OF_STOCK', 'FULFILMENT_CREATION_FAILED', 'WITHIN_EXPECTED_PROCESSING_TIME', 'SHIPMENT_LABEL_CREATION_FAILED', 'SHIPMENT_ALREADY_EXISTS', 'PAYMENT_NOT_CONFIRMED', 'CAUSE_NOT_DETERMINED');

-- CreateEnum
CREATE TYPE "operations"."diagnosis_confidence" AS ENUM ('CONFIRMED');

-- CreateEnum
CREATE TYPE "operations"."review_status" AS ENUM ('AWAITING_REVIEW', 'IN_REVIEW', 'CLOSED');

-- CreateEnum
CREATE TYPE "operations"."review_queue" AS ENUM ('FULFILMENT_OPERATIONS', 'SHIPPING_OPERATIONS', 'PAYMENT_OPERATIONS', 'OPERATIONS_DATA_REVIEW', 'GENERAL_COMMERCE_OPERATIONS');

-- CreateEnum
CREATE TYPE "operations"."review_reason_code" AS ENUM ('ASSIGNED_WAREHOUSE_OUT_OF_STOCK', 'FULFILMENT_CREATION_FAILED', 'SHIPMENT_LABEL_CREATION_FAILED', 'SHIPMENT_ALREADY_EXISTS', 'PAYMENT_NOT_CONFIRMED', 'CAUSE_NOT_DETERMINED', 'MISSING_EVIDENCE', 'CONFLICTING_EVIDENCE');

-- CreateEnum
CREATE TYPE "operations"."idempotency_resource_type" AS ENUM ('INVESTIGATION', 'HUMAN_REVIEW_ESCALATION');

-- CreateEnum
CREATE TYPE "operations"."audit_status" AS ENUM ('STARTED', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "operations"."audit_event_type" AS ENUM ('INVESTIGATION_STARTED', 'INVESTIGATION_FAILED', 'TOOL_CALL_STARTED', 'ORDER_FETCHED', 'PAYMENT_FETCHED', 'FULFILMENT_FETCHED', 'INVENTORY_FETCHED', 'SHIPMENT_CHECKED', 'EVENTS_FETCHED', 'EVIDENCE_VALIDATED', 'DIAGNOSIS_MATCHED', 'INVESTIGATION_PERSISTED', 'TOOL_CALL_SUCCEEDED', 'TOOL_CALL_FAILED', 'HUMAN_REVIEW_CASE_CREATED', 'HUMAN_REVIEW_CASE_REUSED');

-- CreateTable
CREATE TABLE "commerce"."orders" (
    "id" TEXT NOT NULL,
    "status" "commerce"."order_status" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce"."order_items" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce"."payments" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "status" "commerce"."payment_status" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "provider_reference" TEXT,
    "observed_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce"."warehouses" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce"."inventory_levels" (
    "warehouse_id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "source_system" "commerce"."inventory_source_system" NOT NULL,
    "available_quantity" INTEGER NOT NULL,
    "observed_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "inventory_levels_pkey" PRIMARY KEY ("warehouse_id","sku","source_system")
);

-- CreateTable
CREATE TABLE "commerce"."fulfilments" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "status" "commerce"."fulfilment_status" NOT NULL,
    "hold_reason" "commerce"."fulfilment_hold_reason",
    "assigned_warehouse_id" TEXT,
    "provider_reference" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "observed_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "fulfilments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce"."fulfilment_events" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "fulfilment_id" TEXT,
    "source_event_reference" TEXT,
    "type" "commerce"."fulfilment_event_type" NOT NULL,
    "status" "commerce"."fulfilment_event_status" NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "fulfilment_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce"."shipments" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "fulfilment_id" TEXT,
    "status" "commerce"."shipment_status" NOT NULL,
    "provider_reference" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "observed_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "shipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operations"."investigations" (
    "id" TEXT NOT NULL,
    "trace_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "client_request_id" TEXT NOT NULL,
    "status" "operations"."investigation_status" NOT NULL,
    "evidence_status" "operations"."evidence_status",
    "diagnosis_code" "operations"."diagnosis_code",
    "confidence" "operations"."diagnosis_confidence",
    "matched_rule" TEXT,
    "suggested_queue" "operations"."review_queue",
    "suggested_next_step" TEXT,
    "error_code" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "investigations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operations"."investigation_evidence" (
    "investigation_id" TEXT NOT NULL,
    "snapshot_schema_version" SMALLINT NOT NULL DEFAULT 1,
    "snapshot" JSONB NOT NULL,
    "missing_fields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "conflicts" JSONB NOT NULL DEFAULT '[]',
    "source_observed_at" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "investigation_evidence_pkey" PRIMARY KEY ("investigation_id")
);

-- CreateTable
CREATE TABLE "operations"."human_review_escalations" (
    "id" TEXT NOT NULL,
    "investigation_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "status" "operations"."review_status" NOT NULL,
    "queue" "operations"."review_queue" NOT NULL,
    "reason_code" "operations"."review_reason_code" NOT NULL,
    "suggested_next_step" TEXT NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "closed_at" TIMESTAMPTZ(6),

    CONSTRAINT "human_review_escalations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operations"."idempotency_records" (
    "tool_name" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "resource_type" "operations"."idempotency_resource_type" NOT NULL,
    "resource_id" TEXT NOT NULL,
    "response_snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("tool_name","idempotency_key")
);

-- CreateTable
CREATE TABLE "operations"."audit_events" (
    "id" BIGSERIAL NOT NULL,
    "event_key" TEXT NOT NULL,
    "trace_id" TEXT NOT NULL,
    "investigation_id" TEXT,
    "escalation_id" TEXT,
    "event_type" "operations"."audit_event_type" NOT NULL,
    "tool_name" TEXT,
    "status" "operations"."audit_status" NOT NULL,
    "safe_input_summary" JSONB,
    "safe_output_summary" JSONB,
    "error_code" TEXT,
    "duration_ms" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "order_items_order_id_sku_key" ON "commerce"."order_items"("order_id", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "payments_order_id_key" ON "commerce"."payments"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_reference_key" ON "commerce"."payments"("provider_reference");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_name_key" ON "commerce"."warehouses"("name");

-- CreateIndex
CREATE INDEX "inventory_levels_sku_warehouse_id_idx" ON "commerce"."inventory_levels"("sku", "warehouse_id");

-- CreateIndex
CREATE UNIQUE INDEX "fulfilments_order_id_key" ON "commerce"."fulfilments"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "fulfilments_provider_reference_key" ON "commerce"."fulfilments"("provider_reference");

-- CreateIndex
CREATE INDEX "fulfilments_assigned_warehouse_id_order_id_idx" ON "commerce"."fulfilments"("assigned_warehouse_id", "order_id");

-- CreateIndex
CREATE UNIQUE INDEX "fulfilments_id_order_id_key" ON "commerce"."fulfilments"("id", "order_id");

-- CreateIndex
CREATE UNIQUE INDEX "fulfilment_events_source_event_reference_key" ON "commerce"."fulfilment_events"("source_event_reference");

-- CreateIndex
CREATE INDEX "fulfilment_events_order_id_occurred_at_id_idx" ON "commerce"."fulfilment_events"("order_id", "occurred_at", "id");

-- CreateIndex
CREATE INDEX "fulfilment_events_fulfilment_id_occurred_at_id_idx" ON "commerce"."fulfilment_events"("fulfilment_id", "occurred_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "shipments_order_id_key" ON "commerce"."shipments"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "shipments_provider_reference_key" ON "commerce"."shipments"("provider_reference");

-- CreateIndex
CREATE UNIQUE INDEX "investigations_trace_id_key" ON "operations"."investigations"("trace_id");

-- CreateIndex
CREATE UNIQUE INDEX "investigations_client_request_id_key" ON "operations"."investigations"("client_request_id");

-- CreateIndex
CREATE INDEX "investigations_order_id_created_at_id_idx" ON "operations"."investigations"("order_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "investigations_status_created_at_id_idx" ON "operations"."investigations"("status", "created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "human_review_escalations_investigation_id_key" ON "operations"."human_review_escalations"("investigation_id");

-- CreateIndex
CREATE UNIQUE INDEX "human_review_escalations_dedupe_key_key" ON "operations"."human_review_escalations"("dedupe_key");

-- CreateIndex
CREATE INDEX "human_review_escalations_queue_status_created_at_id_idx" ON "operations"."human_review_escalations"("queue", "status", "created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "audit_events_event_key_key" ON "operations"."audit_events"("event_key");

-- CreateIndex
CREATE INDEX "audit_events_trace_id_created_at_id_idx" ON "operations"."audit_events"("trace_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "audit_events_investigation_id_created_at_id_idx" ON "operations"."audit_events"("investigation_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "audit_events_escalation_id_created_at_id_idx" ON "operations"."audit_events"("escalation_id", "created_at", "id");

-- AddForeignKey
ALTER TABLE "commerce"."order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "commerce"."orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "commerce"."orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."inventory_levels" ADD CONSTRAINT "inventory_levels_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "commerce"."warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."fulfilments" ADD CONSTRAINT "fulfilments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "commerce"."orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."fulfilments" ADD CONSTRAINT "fulfilments_assigned_warehouse_id_fkey" FOREIGN KEY ("assigned_warehouse_id") REFERENCES "commerce"."warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."fulfilment_events" ADD CONSTRAINT "fulfilment_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "commerce"."orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."fulfilment_events" ADD CONSTRAINT "fulfilment_events_fulfilment_id_order_id_fkey" FOREIGN KEY ("fulfilment_id", "order_id") REFERENCES "commerce"."fulfilments"("id", "order_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."shipments" ADD CONSTRAINT "shipments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "commerce"."orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."shipments" ADD CONSTRAINT "shipments_fulfilment_id_order_id_fkey" FOREIGN KEY ("fulfilment_id", "order_id") REFERENCES "commerce"."fulfilments"("id", "order_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operations"."investigations" ADD CONSTRAINT "investigations_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "commerce"."orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operations"."investigation_evidence" ADD CONSTRAINT "investigation_evidence_investigation_id_fkey" FOREIGN KEY ("investigation_id") REFERENCES "operations"."investigations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operations"."human_review_escalations" ADD CONSTRAINT "human_review_escalations_investigation_id_fkey" FOREIGN KEY ("investigation_id") REFERENCES "operations"."investigations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operations"."human_review_escalations" ADD CONSTRAINT "human_review_escalations_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "commerce"."orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operations"."audit_events" ADD CONSTRAINT "audit_events_investigation_id_fkey" FOREIGN KEY ("investigation_id") REFERENCES "operations"."investigations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operations"."audit_events" ADD CONSTRAINT "audit_events_escalation_id_fkey" FOREIGN KEY ("escalation_id") REFERENCES "operations"."human_review_escalations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reviewed Phase 1 and Phase 3 constraints that Prisma schema syntax cannot express.
ALTER TABLE "commerce"."orders"
  ADD CONSTRAINT "orders_id_nonempty_check" CHECK (btrim("id") <> ''),
  ADD CONSTRAINT "orders_timestamp_order_check" CHECK ("updated_at" >= "created_at");

ALTER TABLE "commerce"."order_items"
  ADD CONSTRAINT "order_items_id_nonempty_check" CHECK (btrim("id") <> ''),
  ADD CONSTRAINT "order_items_sku_nonempty_check" CHECK (btrim("sku") <> ''),
  ADD CONSTRAINT "order_items_quantity_positive_check" CHECK ("quantity" > 0);

ALTER TABLE "commerce"."payments"
  ADD CONSTRAINT "payments_id_nonempty_check" CHECK (btrim("id") <> ''),
  ADD CONSTRAINT "payments_amount_nonnegative_check" CHECK ("amount" >= 0),
  ADD CONSTRAINT "payments_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$');

ALTER TABLE "commerce"."warehouses"
  ADD CONSTRAINT "warehouses_id_nonempty_check" CHECK (btrim("id") <> ''),
  ADD CONSTRAINT "warehouses_name_nonempty_check" CHECK (btrim("name") <> '');

ALTER TABLE "commerce"."inventory_levels"
  ADD CONSTRAINT "inventory_levels_sku_nonempty_check" CHECK (btrim("sku") <> ''),
  ADD CONSTRAINT "inventory_levels_quantity_nonnegative_check" CHECK ("available_quantity" >= 0);

ALTER TABLE "commerce"."fulfilments"
  ADD CONSTRAINT "fulfilments_id_nonempty_check" CHECK (btrim("id") <> ''),
  ADD CONSTRAINT "fulfilments_timestamp_order_check" CHECK ("updated_at" >= "created_at"),
  ADD CONSTRAINT "fulfilments_hold_reason_check" CHECK (
    ("status" = 'ON_HOLD' AND "hold_reason" IS NOT NULL)
    OR ("status" <> 'ON_HOLD' AND "hold_reason" IS NULL)
  );

ALTER TABLE "commerce"."fulfilment_events"
  ADD CONSTRAINT "fulfilment_events_id_nonempty_check" CHECK (btrim("id") <> ''),
  ADD CONSTRAINT "fulfilment_events_details_object_check" CHECK (jsonb_typeof("details") = 'object'),
  ADD CONSTRAINT "fulfilment_events_nullable_fulfilment_check" CHECK (
    "fulfilment_id" IS NOT NULL OR "type" = 'FULFILMENT_CREATION_FAILED'
  );

ALTER TABLE "commerce"."shipments"
  ADD CONSTRAINT "shipments_id_nonempty_check" CHECK (btrim("id") <> '');

ALTER TABLE "operations"."investigations"
  ADD CONSTRAINT "investigations_id_nonempty_check" CHECK (btrim("id") <> ''),
  ADD CONSTRAINT "investigations_timestamp_order_check" CHECK ("updated_at" >= "created_at"),
  ADD CONSTRAINT "investigations_status_shape_check" CHECK (
    (
      "status" = 'RUNNING'
      AND "completed_at" IS NULL
      AND "diagnosis_code" IS NULL
      AND "confidence" IS NULL
      AND "matched_rule" IS NULL
      AND "error_code" IS NULL
    )
    OR (
      "status" = 'COMPLETED'
      AND "evidence_status" = 'COMPLETE'
      AND "diagnosis_code" IS NOT NULL
      AND "confidence" IS NOT NULL
      AND "matched_rule" IS NOT NULL
      AND "completed_at" IS NOT NULL
      AND "error_code" IS NULL
    )
    OR (
      "status" = 'NEEDS_MORE_INFO'
      AND "evidence_status" IN ('MISSING', 'CONFLICTING')
      AND "diagnosis_code" IS NULL
      AND "confidence" IS NULL
      AND "matched_rule" IS NULL
      AND "completed_at" IS NOT NULL
      AND "error_code" IS NULL
    )
    OR (
      "status" = 'FAILED'
      AND "diagnosis_code" IS NULL
      AND "confidence" IS NULL
      AND "matched_rule" IS NULL
      AND "completed_at" IS NOT NULL
      AND "error_code" IS NOT NULL
    )
  );

ALTER TABLE "operations"."investigation_evidence"
  ALTER COLUMN "missing_fields" SET NOT NULL,
  ADD CONSTRAINT "investigation_evidence_version_positive_check" CHECK ("snapshot_schema_version" > 0),
  ADD CONSTRAINT "investigation_evidence_snapshot_object_check" CHECK (jsonb_typeof("snapshot") = 'object'),
  ADD CONSTRAINT "investigation_evidence_conflicts_array_check" CHECK (jsonb_typeof("conflicts") = 'array'),
  ADD CONSTRAINT "investigation_evidence_sources_object_check" CHECK (jsonb_typeof("source_observed_at") = 'object');

ALTER TABLE "operations"."human_review_escalations"
  ADD CONSTRAINT "human_review_escalations_id_nonempty_check" CHECK (btrim("id") <> ''),
  ADD CONSTRAINT "human_review_escalations_timestamp_order_check" CHECK ("updated_at" >= "created_at"),
  ADD CONSTRAINT "human_review_escalations_closed_at_check" CHECK (
    ("status" = 'CLOSED' AND "closed_at" IS NOT NULL)
    OR ("status" <> 'CLOSED' AND "closed_at" IS NULL)
  );

ALTER TABLE "operations"."idempotency_records"
  ADD CONSTRAINT "idempotency_records_tool_name_nonempty_check" CHECK (btrim("tool_name") <> ''),
  ADD CONSTRAINT "idempotency_records_key_nonempty_check" CHECK (btrim("idempotency_key") <> ''),
  ADD CONSTRAINT "idempotency_records_hash_check" CHECK ("request_hash" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "idempotency_records_response_object_check" CHECK (jsonb_typeof("response_snapshot") = 'object');

ALTER TABLE "operations"."audit_events"
  ADD CONSTRAINT "audit_events_event_key_nonempty_check" CHECK (btrim("event_key") <> ''),
  ADD CONSTRAINT "audit_events_trace_id_nonempty_check" CHECK (btrim("trace_id") <> ''),
  ADD CONSTRAINT "audit_events_duration_nonnegative_check" CHECK ("duration_ms" IS NULL OR "duration_ms" >= 0),
  ADD CONSTRAINT "audit_events_input_object_check" CHECK ("safe_input_summary" IS NULL OR jsonb_typeof("safe_input_summary") = 'object'),
  ADD CONSTRAINT "audit_events_output_object_check" CHECK ("safe_output_summary" IS NULL OR jsonb_typeof("safe_output_summary") = 'object');
