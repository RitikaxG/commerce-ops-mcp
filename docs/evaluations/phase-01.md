# Phase 01 Evaluation Report

## Goal

Produce a complete, client-reviewable PostgreSQL schema proposal before application, Prisma migration, AI, or MCP implementation.

## Scope implemented

- Defined 8 read-only `commerce` entities and 5 writable-workflow `operations` entities.
- Defined columns, types, nullability, primary/foreign keys, constraints, rationale, and cardinality.
- Defined operational/workflow enums and separated diagnosis from lifecycle/evidence states.
- Added an ER diagram, permission design, invariant enforcement, indexes, JSONB snapshot rationale, and audit rationale.
- Demonstrated `ORD-1042` and `NEEDS_MORE_INFO` without ad hoc fields.
- Added a concise client-review summary and explicit confirmation questions.

No Prisma model, migration, database client, seed, application, AI behavior, or MCP tool was created or changed.

## Files and packages changed

| Area                   | File                                     | Change                                                                 |
| ---------------------- | ---------------------------------------- | ---------------------------------------------------------------------- |
| Database documentation | `docs/database/schema-proposal.md`       | Complete scoped PostgreSQL proposal.                                   |
| Database documentation | `docs/database/client-review-summary.md` | Concise client-facing review packet.                                   |
| Evaluation             | `docs/evaluations/phase-01.md`           | Phase 1 checks, evidence, limitations, and decision.                   |
| Repository guidance    | `AGENTS.md`                              | Phase status, proposed schema decisions, gates, and verified commands. |
| Repository summary     | `README.md`                              | Phase 1 status and proposal/evaluation links.                          |
| Accepted contract      | `docs/workflow-contract.md`              | Corrected Phase 0 contract status to accepted.                         |
| Phase process          | `docs/plans/how-to-use-phase-prompts.md` | Updated the current handoff to client schema review.                   |

No app or package implementation file changed.

## Automated checks

| Command                                                  | Expected                                                                                                               | Actual                                                                                                                 | Result |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------ |
| Bun schema-document consistency assertion, initial run   | Required entities/statuses/scenarios and `commerceStateChanged` are explicit; ER references are defined.               | Failed because the proposal enforced no mutation but omitted the explicit `commerceStateChanged=false` response field. | Fail   |
| Bun schema-document consistency assertion, rerun         | Same assertions after correction.                                                                                      | `27 required tokens present; 12 ER entities defined; 0 undefined ER references`.                                       | Pass   |
| Bun client-summary consistency assertion                 | Summary contains the boundary, entity groups, lifecycle/evidence/review states, all 7 diagnosis codes, and `ORD-1042`. | All required summary tokens matched the proposal.                                                                      | Pass   |
| `bunx prettier --check AGENTS.md README.md docs/**/*.md` | All Markdown is formatted.                                                                                             | `All matched files use Prettier code style!`                                                                           | Pass   |
| `git diff --check`                                       | No whitespace errors.                                                                                                  | No output; exit code 0.                                                                                                | Pass   |
| `git diff -- packages/db`                                | Existing Prisma scaffold remains unchanged.                                                                            | No output.                                                                                                             | Pass   |
| Prisma migration-directory check                         | No migration exists.                                                                                                   | `packages/db/prisma/migrations` is absent.                                                                             | Pass   |
| Mermaid CLI availability check                           | Render the ERD if tooling exists.                                                                                      | Mermaid CLI is unavailable in the workspace; manual syntax review performed.                                           | Manual |

All Bun commands used:

```sh
PATH=/Users/ritikagupta/.bun/bin:/opt/homebrew/bin:/usr/bin:/bin
```

The exact Bun consistency commands were:

````sh
PATH=/Users/ritikagupta/.bun/bin:/opt/homebrew/bin:/usr/bin:/bin bun -e 'const text = await Bun.file("docs/database/schema-proposal.md").text(); const required = ["commerce.orders","commerce.order_items","commerce.payments","commerce.warehouses","commerce.inventory_levels","commerce.fulfilments","commerce.fulfilment_events","commerce.shipments","operations.investigations","operations.investigation_evidence","operations.human_review_escalations","operations.idempotency_records","operations.audit_events","RUNNING","COMPLETED","NEEDS_MORE_INFO","FAILED","COMPLETE","MISSING","CONFLICTING","AWAITING_REVIEW","IN_REVIEW","CLOSED","ORD-1042","ORD-1046","IDEMPOTENCY_KEY_REUSE","commerceStateChanged"]; const missing = required.filter((token) => !text.includes(token)); if (missing.length) throw new Error("Missing required tokens: " + missing.join(", ")); const diagram = text.split("```mermaid")[1]?.split("```")[0] ?? ""; const defined = new Set(["COMMERCE_ORDERS","COMMERCE_ORDER_ITEMS","COMMERCE_PAYMENTS","COMMERCE_WAREHOUSES","COMMERCE_INVENTORY_LEVELS","COMMERCE_FULFILMENTS","COMMERCE_FULFILMENT_EVENTS","COMMERCE_SHIPMENTS","OPERATIONS_INVESTIGATIONS","OPERATIONS_INVESTIGATION_EVIDENCE","OPERATIONS_HUMAN_REVIEW_ESCALATIONS","OPERATIONS_AUDIT_EVENTS"]); const refs = [...diagram.matchAll(/(?:COMMERCE|OPERATIONS)_[A-Z_]+/g)].map((match) => match[0]); const unknown = [...new Set(refs.filter((ref) => !defined.has(ref)))]; if (unknown.length) throw new Error("Undefined ER entities: " + unknown.join(", ")); console.log("schema-doc consistency: 27 required tokens present; " + defined.size + " ER entities defined; 0 undefined ER references");'

PATH=/Users/ritikagupta/.bun/bin:/opt/homebrew/bin:/usr/bin:/bin bun -e 'const proposal = await Bun.file("docs/database/schema-proposal.md").text(); const summary = await Bun.file("docs/database/client-review-summary.md").text(); const diagnoses = ["ASSIGNED_WAREHOUSE_OUT_OF_STOCK","FULFILMENT_CREATION_FAILED","WITHIN_EXPECTED_PROCESSING_TIME","SHIPMENT_LABEL_CREATION_FAILED","SHIPMENT_ALREADY_EXISTS","PAYMENT_NOT_CONFIRMED","CAUSE_NOT_DETERMINED"]; const required = ["commerce","operations","investigations","investigation_evidence","human_review_escalations","idempotency_records","audit_events","RUNNING","COMPLETED","NEEDS_MORE_INFO","FAILED","COMPLETE","MISSING","CONFLICTING","AWAITING_REVIEW","IN_REVIEW","CLOSED","ORD-1042","commerceStateChanged=false",...diagnoses]; const missingSummary = required.filter((token) => !summary.includes(token)); const missingProposal = diagnoses.filter((token) => !proposal.includes(token)); if (missingSummary.length || missingProposal.length) throw new Error("Review summary mismatch: " + [...missingSummary,...missingProposal].join(", ")); console.log("client-summary consistency: boundary, 13 entity names/groups, 11 lifecycle/evidence/review states, 7 diagnosis codes, and ORD-1042 present");'
````

No Prisma validate, format, generate, migrate, push, seed, or database command was run.

## Manual verification

### Documentation consistency

- Confirmed all 13 required tables have a purpose, columns, nullability, keys/constraints, and rationale.
- Confirmed all ER relationships point to defined entities. The ERD contains 12 relational entities; polymorphic `idempotency_records.resource_id` is deliberately omitted from relationship lines and explained in text.
- Confirmed every lifecycle/evidence/review/audit status used by an invariant is defined.
- Confirmed all diagnosis and review-reason codes are explicitly enumerated.
- Confirmed maximum-one current payment/fulfilment/shipment cardinality is stated and justified.

### Safety review

- The workflow runtime has `SELECT` only on `commerce`.
- Commerce seed/reset writes use a separate non-runtime role.
- Operations evidence, idempotency, and audit records are insert-only for the workflow runtime.
- No schema object or role grants a commerce mutation path to the application.
- The proposal explicitly requires `commerceStateChanged=false`.

### Scenario review

- `ORD-1042` uses the defined order, item, payment, warehouse, inventory, fulfilment, event, and optional shipment structures.
- Its investigation, snapshot, diagnosis, idempotency, escalation, and audit records use only proposed columns.
- `ORD-1046` represents a missing assigned-warehouse inventory row as `MISSING`/`NEEDS_MORE_INFO`, with `missing_fields`, no diagnosis, and a safe evidence-verification next step.
- A conflicting-evidence case uses the same structure with `CONFLICTING` and structured conflicts.

### Idempotency review

- `(tool_name, idempotency_key)` is the primary key.
- A matching canonical request hash returns the stored resource/response.
- A different hash returns `IDEMPOTENCY_KEY_REUSE` and creates nothing.
- Investigation/case and idempotency records are committed in one transaction.
- Lifetime-unique investigation/dedupe keys prevent duplicate cases.

### Traceability review

The proposal can answer:

- which tool ran and its observable status/duration;
- which evidence and source timestamps were available;
- what was missing or conflicting;
- which deterministic rule matched;
- which response/resource an idempotent retry returned; and
- whether a human-review case was created or reused.

Raw prompts, secrets, unrestricted provider payloads, and hidden chain of thought are excluded.

### Mermaid review

Manually inspected the `erDiagram` block:

- relationship cardinality tokens are balanced;
- all 12 diagram entities have definition blocks;
- all PK/FK/UK annotations refer to documented columns; and
- the omitted polymorphic idempotency relationship is explicitly explained.

### Scope review

- `git diff -- packages/db` returned no changes.
- No Prisma migration directory exists.
- No app, package, route, tool, client, fixture, or runtime file was edited.
- User-owned repository changes were preserved.

## Guardrails verified

- No commerce mutation capability or grant is proposed.
- `COMPLETED` requires `COMPLETE` evidence and a deterministic diagnosis.
- `NEEDS_MORE_INFO` requires missing/conflicting detail and forbids diagnosis.
- Missing inventory cannot be interpreted as zero inventory.
- Evidence snapshots are immutable; audit events are append-only.
- Escalations are derived from stored investigations, not model-supplied facts.
- Database roles separate migration, seed/reset, workflow runtime, and human review.
- Phase 2 remains blocked until client schema approval.

## Sample output / IDs / trace evidence

The proposal represents planned IDs `ORD-1042`, `INV-2001`, `TRACE-2001`, `CASE-2001`, and a missing-evidence `ORD-1046` flow. These are schema walkthrough examples, not runtime-generated records.

## Known limitations

- Client schema approval is pending.
- The existing Prisma schema remains empty; no proposal detail is implemented.
- Cross-table terminal-state and escalation consistency require PostgreSQL constraint triggers in Phase 4 because Prisma schema syntax cannot express them alone.
- Mermaid CLI was unavailable; the ERD received manual syntax review only.
- Native enum, identifier, current-record cardinality, role-separation, and reopen-case choices may change during client review.

## Unresolved questions

Client confirmation is required for:

1. maximum one current payment, fulfilment, and shipment per order;
2. human-readable `text` identifiers;
3. native PostgreSQL enums;
4. one case per investigation lifetime versus reopen-as-new-case;
5. cross-schema foreign keys;
6. separate migration, seed/reset, runtime, and reviewer roles; and
7. versioned immutable JSONB evidence plus relational searchable outcomes.

## Decisions changed during review

No accepted Phase 0 safety or package-boundary decision changed.

The initial consistency check led to an explicit `commerceStateChanged=false` response guarantee in both review documents. The proposal also clarifies that SKU is a shared text business key because a product catalogue is outside scope.

## Exit decision

**Awaiting client schema approval**

The Phase 1 documents pass the required design checks and are ready for client acceptance or revision. No implementation phase may begin before approval.
