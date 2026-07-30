-- Trigger entry points run with their owning migration role so restricted
-- workflow users cannot call the private validation helpers directly.

ALTER FUNCTION "operations"."enforce_terminal_investigation"()
  SECURITY DEFINER;

ALTER FUNCTION "operations"."enforce_human_review_escalation"()
  SECURITY DEFINER;

ALTER FUNCTION "operations"."enforce_idempotency_resource"()
  SECURITY DEFINER;

ALTER FUNCTION "operations"."protect_idempotency_resource"()
  SECURITY DEFINER;
