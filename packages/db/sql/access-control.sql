-- Run only through the owner-only db:setup-access command.
-- Passwords are supplied by the Bun setup process and never stored here.

REVOKE CREATE ON SCHEMA "public" FROM PUBLIC;
REVOKE ALL ON SCHEMA "commerce", "operations" FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA "commerce", "operations" FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA "commerce", "operations" FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA "commerce", "operations" FROM PUBLIC;

REVOKE ALL ON SCHEMA "commerce", "operations" FROM "commerce_demo", "commerce_workflow";
REVOKE ALL ON ALL TABLES IN SCHEMA "commerce", "operations" FROM "commerce_demo", "commerce_workflow";
REVOKE ALL ON ALL SEQUENCES IN SCHEMA "commerce", "operations" FROM "commerce_demo", "commerce_workflow";
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA "commerce", "operations" FROM "commerce_demo", "commerce_workflow";

GRANT USAGE ON SCHEMA "commerce" TO "commerce_demo";
GRANT SELECT, INSERT, UPDATE, DELETE
  ON ALL TABLES IN SCHEMA "commerce"
  TO "commerce_demo";

GRANT USAGE ON SCHEMA "commerce", "operations" TO "commerce_workflow";
GRANT SELECT
  ON ALL TABLES IN SCHEMA "commerce"
  TO "commerce_workflow";
GRANT SELECT, INSERT
  ON ALL TABLES IN SCHEMA "operations"
  TO "commerce_workflow";
GRANT UPDATE (
  "status",
  "evidence_status",
  "diagnosis_code",
  "confidence",
  "matched_rule",
  "suggested_queue",
  "suggested_next_step",
  "error_code",
  "updated_at",
  "completed_at"
)
  ON "operations"."investigations"
  TO "commerce_workflow";
GRANT USAGE, SELECT
  ON ALL SEQUENCES IN SCHEMA "operations"
  TO "commerce_workflow";

ALTER DEFAULT PRIVILEGES IN SCHEMA "commerce"
  REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA "operations"
  REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA "operations"
  REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA "commerce"
  REVOKE ALL ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA "operations"
  REVOKE ALL ON FUNCTIONS FROM PUBLIC;
