-- Phase 4 database invariants that Prisma cannot express.

CREATE OR REPLACE FUNCTION "operations"."validate_terminal_investigation"(
  investigation_id_to_validate TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
DECLARE
  investigation_record "operations"."investigations"%ROWTYPE;
  evidence_record "operations"."investigation_evidence"%ROWTYPE;
  evidence_count BIGINT;
BEGIN
  SELECT *
  INTO investigation_record
  FROM "operations"."investigations"
  WHERE "id" = investigation_id_to_validate;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF investigation_record."status" NOT IN (
    'COMPLETED'::"operations"."investigation_status",
    'NEEDS_MORE_INFO'::"operations"."investigation_status"
  ) THEN
    RETURN;
  END IF;

  SELECT count(*)
  INTO evidence_count
  FROM "operations"."investigation_evidence"
  WHERE "investigation_id" = investigation_id_to_validate;

  IF evidence_count <> 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'terminal_investigation_exactly_one_evidence',
      MESSAGE = format(
        'Terminal investigation %s requires exactly one evidence snapshot',
        investigation_id_to_validate
      );
  END IF;

  SELECT *
  INTO STRICT evidence_record
  FROM "operations"."investigation_evidence"
  WHERE "investigation_id" = investigation_id_to_validate;

  IF investigation_record."status" = 'COMPLETED'::"operations"."investigation_status" THEN
    IF investigation_record."evidence_status" IS DISTINCT FROM 'COMPLETE'::"operations"."evidence_status"
      OR investigation_record."diagnosis_code" IS NULL
      OR investigation_record."confidence" IS NULL
      OR investigation_record."matched_rule" IS NULL
      OR investigation_record."completed_at" IS NULL
      OR cardinality(evidence_record."missing_fields") <> 0
      OR jsonb_array_length(evidence_record."conflicts") <> 0
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        CONSTRAINT = 'completed_investigation_evidence_consistency',
        MESSAGE = format(
          'Completed investigation %s requires complete, non-conflicting evidence and a persisted diagnosis',
          investigation_id_to_validate
        );
    END IF;

    RETURN;
  END IF;

  IF investigation_record."diagnosis_code" IS NOT NULL
    OR investigation_record."confidence" IS NOT NULL
    OR investigation_record."matched_rule" IS NOT NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'needs_more_info_forbids_diagnosis',
      MESSAGE = format(
        'Needs-more-info investigation %s cannot persist a diagnosis',
        investigation_id_to_validate
      );
  END IF;

  IF investigation_record."evidence_status" = 'MISSING'::"operations"."evidence_status" THEN
    IF cardinality(evidence_record."missing_fields") = 0 THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        CONSTRAINT = 'missing_evidence_requires_fields',
        MESSAGE = format(
          'Missing-evidence investigation %s requires at least one missing field',
          investigation_id_to_validate
        );
    END IF;
  ELSIF investigation_record."evidence_status" = 'CONFLICTING'::"operations"."evidence_status" THEN
    IF jsonb_array_length(evidence_record."conflicts") = 0
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements(evidence_record."conflicts") AS conflict(value)
        WHERE jsonb_typeof(conflict.value) <> 'object'
          OR conflict.value = '{}'::jsonb
      )
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        CONSTRAINT = 'conflicting_evidence_requires_structured_conflicts',
        MESSAGE = format(
          'Conflicting-evidence investigation %s requires at least one structured conflict',
          investigation_id_to_validate
        );
    END IF;
  ELSE
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'needs_more_info_requires_uncertain_evidence',
      MESSAGE = format(
        'Needs-more-info investigation %s requires missing or conflicting evidence',
        investigation_id_to_validate
      );
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION "operations"."enforce_terminal_investigation"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
DECLARE
  investigation_id_to_validate TEXT;
BEGIN
  IF TG_TABLE_NAME = 'investigations' THEN
    investigation_id_to_validate := NEW."id";
  ELSE
    investigation_id_to_validate := NEW."investigation_id";
  END IF;

  PERFORM "operations"."validate_terminal_investigation"(
    investigation_id_to_validate
  );

  RETURN NULL;
END;
$function$;

CREATE CONSTRAINT TRIGGER "investigations_terminal_evidence_check"
AFTER INSERT OR UPDATE ON "operations"."investigations"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "operations"."enforce_terminal_investigation"();

CREATE CONSTRAINT TRIGGER "investigation_evidence_terminal_check"
AFTER INSERT ON "operations"."investigation_evidence"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "operations"."enforce_terminal_investigation"();

CREATE OR REPLACE FUNCTION "operations"."reject_immutable_record_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '55000',
    MESSAGE = format(
      '%I.%I is append-only; %s is not allowed',
      TG_TABLE_SCHEMA,
      TG_TABLE_NAME,
      TG_OP
    );
END;
$function$;

CREATE TRIGGER "investigation_evidence_immutable"
BEFORE UPDATE OR DELETE ON "operations"."investigation_evidence"
FOR EACH ROW
EXECUTE FUNCTION "operations"."reject_immutable_record_mutation"();

CREATE TRIGGER "audit_events_append_only"
BEFORE UPDATE OR DELETE ON "operations"."audit_events"
FOR EACH ROW
EXECUTE FUNCTION "operations"."reject_immutable_record_mutation"();

CREATE OR REPLACE FUNCTION "operations"."validate_human_review_escalation"(
  escalation_id_to_validate TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
DECLARE
  escalation_record "operations"."human_review_escalations"%ROWTYPE;
  investigation_record "operations"."investigations"%ROWTYPE;
  expected_queue "operations"."review_queue";
  expected_reason TEXT;
BEGIN
  SELECT *
  INTO escalation_record
  FROM "operations"."human_review_escalations"
  WHERE "id" = escalation_id_to_validate;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT *
  INTO investigation_record
  FROM "operations"."investigations"
  WHERE "id" = escalation_record."investigation_id";

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      CONSTRAINT = 'human_review_escalation_investigation_required',
      MESSAGE = format(
        'Escalation %s requires a persisted investigation',
        escalation_id_to_validate
      );
  END IF;

  IF investigation_record."status" = 'NEEDS_MORE_INFO'::"operations"."investigation_status"
    AND investigation_record."evidence_status" = 'MISSING'::"operations"."evidence_status"
  THEN
    expected_queue := 'OPERATIONS_DATA_REVIEW'::"operations"."review_queue";
    expected_reason := 'MISSING_EVIDENCE';
  ELSIF investigation_record."status" = 'NEEDS_MORE_INFO'::"operations"."investigation_status"
    AND investigation_record."evidence_status" = 'CONFLICTING'::"operations"."evidence_status"
  THEN
    expected_queue := 'OPERATIONS_DATA_REVIEW'::"operations"."review_queue";
    expected_reason := 'CONFLICTING_EVIDENCE';
  ELSIF investigation_record."status" = 'COMPLETED'::"operations"."investigation_status" THEN
    CASE investigation_record."diagnosis_code"
      WHEN 'ASSIGNED_WAREHOUSE_OUT_OF_STOCK'::"operations"."diagnosis_code" THEN
        expected_queue := 'FULFILMENT_OPERATIONS'::"operations"."review_queue";
        expected_reason := 'ASSIGNED_WAREHOUSE_OUT_OF_STOCK';
      WHEN 'FULFILMENT_CREATION_FAILED'::"operations"."diagnosis_code" THEN
        expected_queue := 'FULFILMENT_OPERATIONS'::"operations"."review_queue";
        expected_reason := 'FULFILMENT_CREATION_FAILED';
      WHEN 'SHIPMENT_LABEL_CREATION_FAILED'::"operations"."diagnosis_code" THEN
        expected_queue := 'SHIPPING_OPERATIONS'::"operations"."review_queue";
        expected_reason := 'SHIPMENT_LABEL_CREATION_FAILED';
      WHEN 'PAYMENT_NOT_CONFIRMED'::"operations"."diagnosis_code" THEN
        expected_queue := 'PAYMENT_OPERATIONS'::"operations"."review_queue";
        expected_reason := 'PAYMENT_NOT_CONFIRMED';
      WHEN 'CAUSE_NOT_DETERMINED'::"operations"."diagnosis_code" THEN
        expected_queue := 'GENERAL_COMMERCE_OPERATIONS'::"operations"."review_queue";
        expected_reason := 'CAUSE_NOT_DETERMINED';
      ELSE
        RAISE EXCEPTION USING
          ERRCODE = '23514',
          CONSTRAINT = 'human_review_escalation_requires_human_action',
          MESSAGE = format(
            'Investigation %s does not have a human-action outcome',
            investigation_record."id"
          );
    END CASE;
  ELSE
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'human_review_escalation_requires_terminal_investigation',
      MESSAGE = format(
        'Escalation %s requires a terminal investigation outcome',
        escalation_id_to_validate
      );
  END IF;

  IF investigation_record."order_id" IS DISTINCT FROM escalation_record."order_id"
    OR investigation_record."suggested_queue" IS DISTINCT FROM expected_queue
    OR escalation_record."queue" IS DISTINCT FROM expected_queue
    OR escalation_record."reason_code"::TEXT IS DISTINCT FROM expected_reason
    OR investigation_record."suggested_next_step" IS NULL
    OR btrim(investigation_record."suggested_next_step") = ''
    OR escalation_record."suggested_next_step" IS DISTINCT FROM investigation_record."suggested_next_step"
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'human_review_escalation_matches_investigation',
      MESSAGE = format(
        'Escalation %s must match its stored investigation outcome',
        escalation_id_to_validate
      );
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION "operations"."enforce_human_review_escalation"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
BEGIN
  PERFORM "operations"."validate_human_review_escalation"(NEW."id");
  RETURN NULL;
END;
$function$;

CREATE CONSTRAINT TRIGGER "human_review_escalation_consistency"
AFTER INSERT OR UPDATE ON "operations"."human_review_escalations"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "operations"."enforce_human_review_escalation"();

CREATE OR REPLACE FUNCTION "operations"."validate_idempotency_resource"(
  tool_name_to_validate TEXT,
  idempotency_key_to_validate TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
DECLARE
  idempotency_record "operations"."idempotency_records"%ROWTYPE;
  resource_exists BOOLEAN;
BEGIN
  SELECT *
  INTO idempotency_record
  FROM "operations"."idempotency_records"
  WHERE "tool_name" = tool_name_to_validate
    AND "idempotency_key" = idempotency_key_to_validate;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF idempotency_record."resource_type" = 'INVESTIGATION'::"operations"."idempotency_resource_type" THEN
    SELECT EXISTS (
      SELECT 1
      FROM "operations"."investigations"
      WHERE "id" = idempotency_record."resource_id"
    )
    INTO resource_exists;
  ELSE
    SELECT EXISTS (
      SELECT 1
      FROM "operations"."human_review_escalations"
      WHERE "id" = idempotency_record."resource_id"
    )
    INTO resource_exists;
  END IF;

  IF NOT resource_exists THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      CONSTRAINT = 'idempotency_resource_exists',
      MESSAGE = format(
        'Idempotency record %s/%s references a missing or mismatched resource',
        tool_name_to_validate,
        idempotency_key_to_validate
      );
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION "operations"."enforce_idempotency_resource"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
BEGIN
  PERFORM "operations"."validate_idempotency_resource"(
    NEW."tool_name",
    NEW."idempotency_key"
  );
  RETURN NULL;
END;
$function$;

CREATE CONSTRAINT TRIGGER "idempotency_resource_validity"
AFTER INSERT OR UPDATE ON "operations"."idempotency_records"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "operations"."enforce_idempotency_resource"();

CREATE OR REPLACE FUNCTION "operations"."protect_idempotency_resource"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
DECLARE
  resource_type_to_check "operations"."idempotency_resource_type";
BEGIN
  IF TG_TABLE_NAME = 'investigations' THEN
    resource_type_to_check := 'INVESTIGATION'::"operations"."idempotency_resource_type";
  ELSE
    resource_type_to_check := 'HUMAN_REVIEW_ESCALATION'::"operations"."idempotency_resource_type";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "operations"."idempotency_records"
    WHERE "resource_type" = resource_type_to_check
      AND "resource_id" = OLD."id"
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      CONSTRAINT = 'idempotency_resource_remains_valid',
      MESSAGE = format(
        '%s %s is referenced by an idempotency record',
        resource_type_to_check::TEXT,
        OLD."id"
      );
  END IF;

  RETURN NULL;
END;
$function$;

CREATE CONSTRAINT TRIGGER "investigation_idempotency_reference"
AFTER DELETE OR UPDATE OF "id" ON "operations"."investigations"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "operations"."protect_idempotency_resource"();

CREATE CONSTRAINT TRIGGER "escalation_idempotency_reference"
AFTER DELETE OR UPDATE OF "id" ON "operations"."human_review_escalations"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "operations"."protect_idempotency_resource"();

REVOKE ALL ON FUNCTION "operations"."validate_terminal_investigation"(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION "operations"."enforce_terminal_investigation"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "operations"."reject_immutable_record_mutation"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "operations"."validate_human_review_escalation"(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION "operations"."enforce_human_review_escalation"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "operations"."validate_idempotency_resource"(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION "operations"."enforce_idempotency_resource"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "operations"."protect_idempotency_resource"() FROM PUBLIC;
