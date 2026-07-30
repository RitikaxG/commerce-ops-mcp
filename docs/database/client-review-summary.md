# PostgreSQL Schema Acceptance Summary

## Acceptance

The scoped PostgreSQL design for the commerce operations investigator was accepted on 2026-07-30. This document records the client decisions; [schema-proposal.md](schema-proposal.md) is the approved implementation source of truth.

## Product boundary

The workflow answers:

> Why has this paid order not reached shipment creation?

- `commerce`: synthetic operational evidence; runtime `SELECT` only.
- `operations`: investigations and human-review workflow records; minimum scoped writes.
- Allowed: create investigations, immutable evidence snapshots, review cases, idempotency records, and append-only audit events.
- Forbidden: order, payment, inventory, fulfilment, event, or shipment mutation.
- Every investigation/escalation result states `commerceStateChanged=false`.

## Approved entities

### `commerce` - runtime read-only

1. `orders`
2. `order_items`
3. `payments`
4. `warehouses`
5. `inventory_levels`
6. `fulfilments`
7. `fulfilment_events`
8. `shipments`

### `operations` - workflow persistence

1. `investigations`
2. `investigation_evidence`
3. `human_review_escalations`
4. `idempotency_records`
5. `audit_events`

## Relationship choices

- One order has many items and events.
- One order has at most one current payment, fulfilment, and shipment. Absence remains representable as evidence.
- One order can have many investigations.
- A terminal investigation has exactly one immutable evidence snapshot.
- An investigation has at most one human-review case. Retries reuse it and reopening a closed case is out of scope.
- Cases are limited to outcomes requiring human action, including missing/conflicting evidence; `WITHIN_EXPECTED_PROCESSING_TIME` alone is not eligible.
- Investigations and cases have ordered append-only audit events.
- Idempotency records point logically to either an investigation or case.

Payment-attempt history, split fulfilments, and multiple shipments are deferred.

## Status and outcome separation

- Investigation: `RUNNING`, `COMPLETED`, `NEEDS_MORE_INFO`, `FAILED`
- Evidence: `COMPLETE`, `MISSING`, `CONFLICTING`
- Human review: `AWAITING_REVIEW`, `IN_REVIEW`, `CLOSED`
- Audit: `STARTED`, `SUCCEEDED`, `FAILED`

Diagnosis codes:

- `ASSIGNED_WAREHOUSE_OUT_OF_STOCK`
- `FULFILMENT_CREATION_FAILED`
- `WITHIN_EXPECTED_PROCESSING_TIME`
- `SHIPMENT_LABEL_CREATION_FAILED`
- `SHIPMENT_ALREADY_EXISTS`
- `PAYMENT_NOT_CONFIRMED`
- `CAUSE_NOT_DETERMINED`

`NEEDS_MORE_INFO` is a workflow status, not a diagnosis.

## Core invariants

- Order-item quantity is positive; inventory is non-negative.
- Source references are unique when present and all foreign keys are valid.
- An investigation references an existing order.
- `COMPLETED` requires `COMPLETE` evidence, a diagnosis, confidence, and matched deterministic rule.
- `NEEDS_MORE_INFO` requires explicit missing fields or conflicts and no diagnosis.
- Missing/conflicting evidence cannot produce a next step that relies on the uncertain fact.
- Evidence snapshots are immutable and audit events are append-only.
- Escalation fields are derived from the stored investigation, not supplied by the LLM.
- Escalation requires a server-derived human-action outcome, queue, and next step.
- Idempotency is unique per tool/key; the same key with a different request hash conflicts.
- One investigation/dedupe key cannot create duplicate cases.
- Runtime permissions deny every commerce mutation.

## Index and trace choices

Required indexes cover:

- order/current-source lookup;
- inventory lookup by SKU across warehouses;
- ordered fulfilment events;
- trace and investigation lookup;
- human-review queues;
- tool/key idempotency;
- ordered investigation/case audit events.

The design can answer:

- which tool ran;
- which evidence and source timestamps were available;
- what was missing or conflicting;
- which deterministic rule matched;
- which structured response was returned; and
- whether a review case was created or reused.

Raw prompts, secrets, provider payload dumps, and hidden chain of thought are not stored.

## Scenario fit

### `ORD-1042`

The assigned warehouse has zero stock, another active warehouse has sufficient stock, payment succeeded, fulfilment is on an inventory hold, and no shipment exists. The investigation is `COMPLETED` with `ASSIGNED_WAREHOUSE_OUT_OF_STOCK`; a case may be created for `FULFILMENT_OPERATIONS`. No commerce row changes.

### Missing assigned-warehouse inventory

The missing inventory row is recorded in the immutable snapshot and `missing_fields`. The investigation is `NEEDS_MORE_INFO`/`MISSING`, with no diagnosis and only an evidence-verification next step. A human-action case can be routed to `OPERATIONS_DATA_REVIEW`.

## Accepted decisions

1. Keep `commerce` runtime-read-only; allow synthetic writes only through explicit seed/reset.
2. Persist only approved `operations` workflow records and never mutate commerce state.
3. Use at most one current payment, fulfilment, and shipment per order; distinguish absent records from source-read failures.
4. Use readable PostgreSQL `text` IDs, represented as Prisma `String` fields when implemented.
5. Use native PostgreSQL enums.
6. Use one case per investigation and reuse it on retries; reopening is out of scope. Create cases for outcomes requiring human action, including missing/conflicting evidence, but not merely because processing is within the expected window.
7. Keep cross-schema foreign keys because both schemas share one PostgreSQL database.
8. Separate migration, seed/reset, and workflow-runtime roles. A separate reviewer interface/workflow is optional and must not broaden scope.
9. Store versioned immutable JSONB evidence with relational searchable outcome and trace fields.
10. Return `NEEDS_MORE_INFO`, with no guessed diagnosis, for missing or conflicting evidence.

Full columns, nullability, constraints, ERD, permissions, indexes, and walkthroughs are in [schema-proposal.md](schema-proposal.md).
