# Phase 08 Evaluation Report - Deterministic Diagnosis Engine

## Goal

Convert validated normalized evidence and its validated readiness result into a
pure, deterministic investigation decision with versioned rules, selected
supporting facts, safe human-review guidance, and no persistence or commerce
mutation.

## Scope implemented

- Added the public `InvestigationDecision` Zod contract and inferred types.
- Added finite diagnosis confidence, rule-ID, supporting-fact code, and
  supporting-fact schemas.
- Added `DiagnosisEngine` and `createDiagnosisEngine()`.
- Implemented the frozen rule precedence and exact scenario guidance.
- Added deterministic alternative-warehouse eligibility.
- Added a four-hour processing rule based only on `evidence.collectedAt`.
- Corrected the Phase 7 decisive-event gate to require `status=FAILED`.
- Added pure unit tests and a live nine-scenario restricted-role chain.

No repository, persistence, MCP, LLM, API, migration, or operational action was
added.

## Public decision contract

`InvestigationDecision` contains:

- `schemaVersion: 1`;
- the order, investigation, and evidence statuses;
- nullable diagnosis, confirmed confidence, and versioned matched rule;
- escalation flag, review queue, and safe suggested next step;
- a small ordered list of selected, JSON-safe supporting facts;
- unique lexically ordered eligible alternative warehouse IDs; and
- the literal `commerceStateChanged: false`.

The contract rejects contradictory lifecycle, diagnosis/rule, escalation/queue,
suggested-step, supporting-fact order, or alternative-ID combinations.
`NEEDS_MORE_INFO` requires missing/conflicting evidence, null diagnosis fields,
data review, and no alternatives.

`@repo/diagnosis` exports:

```ts
export interface DiagnosisEngine {
  decide(input: {
    evidence: NormalizedOrderEvidence;
    readiness: EvidenceReadinessResult;
  }): InvestigationDecision;
}

export function createDiagnosisEngine(): DiagnosisEngine;
```

Both inputs are Zod-validated and mismatched order IDs are rejected.

## Exact rule precedence

1. `PAYMENT_NOT_CONFIRMED` - `payment_not_confirmed.v1`
2. `SHIPMENT_ALREADY_EXISTS` - `shipment_already_exists.v1`
3. Latest decisive event with `status=FAILED`; newest `occurredAt`, then
   lexically greatest ID:
   - `fulfilment_creation_failed.v1`
   - `shipment_label_creation_failed.v1`
4. `ASSIGNED_WAREHOUSE_OUT_OF_STOCK` -
   `assigned_warehouse_out_of_stock.v1`
5. `WITHIN_EXPECTED_PROCESSING_TIME` -
   `within_expected_processing_time.v1`
6. `CAUSE_NOT_DETERMINED` - `cause_not_determined.v1`

Earlier rules win. A relevant time-based event must not be later than
`evidence.collectedAt`.

## Client-approved deterministic data and time policy

- The current synthetic PostgreSQL records are approved for this bounded
  prototype.
- Live scenario collection uses `2026-07-30T12:00:00.000Z`.
- Diagnosis does not call `Date.now()`, read the environment, or inject a
  hidden clock.
- Wall-clock age does not invalidate synthetic evidence.
- Source observation timestamps remain trace metadata.
- Commerce runtime access remains read-only.
- Synthetic commerce writes remain confined to explicit demo seed/reset
  commands; no seed/reset path was added to runtime code.

## Processing-time policy

The processing rule requires a `PROCESSING` fulfilment and the latest successful
`PROCESSING_STARTED` event. It computes:

```text
elapsed = evidence.collectedAt - processingStartedAt
```

The accepted window is `0 <= elapsed <= 240 minutes`. Exactly four hours is
inside the window; future events and events beyond four hours do not match.
There is no fallback to `fulfilment.updatedAt` or the machine clock.

## Alternative-warehouse eligibility

An alternative must:

1. differ from the assigned warehouse;
2. have a returned warehouse record;
3. be active;
4. have observations for every order-item SKU;
5. have agreeing observations for each warehouse/SKU; and
6. meet every required item quantity.

Missing, inactive, insufficient, or conflicting alternatives are excluded.
Results are unique and lexically ordered. The shortage diagnosis can still
match with no eligible alternative, in which case the engine uses a safe
human-review step that does not claim reassignment is possible.

## All approved decisions

Every actual value below came from:

```text
createWorkflowRepositoryContext()
-> createEvidenceCollector({ fixed 12:00Z clock })
-> createEvidenceReadinessEvaluator()
-> createDiagnosisEngine()
```

| Order      | Expected / actual investigation | Expected / actual evidence | Expected / actual diagnosis       | Escalate | Queue                         | Result |
| ---------- | ------------------------------- | -------------------------- | --------------------------------- | -------- | ----------------------------- | ------ |
| `ORD-1042` | `COMPLETED`                     | `COMPLETE`                 | `ASSIGNED_WAREHOUSE_OUT_OF_STOCK` | Yes      | `FULFILMENT_OPERATIONS`       | Pass   |
| `ORD-1043` | `COMPLETED`                     | `COMPLETE`                 | `FULFILMENT_CREATION_FAILED`      | Yes      | `FULFILMENT_OPERATIONS`       | Pass   |
| `ORD-1044` | `COMPLETED`                     | `COMPLETE`                 | `WITHIN_EXPECTED_PROCESSING_TIME` | No       | `null`                        | Pass   |
| `ORD-1045` | `COMPLETED`                     | `COMPLETE`                 | `SHIPMENT_LABEL_CREATION_FAILED`  | Yes      | `SHIPPING_OPERATIONS`         | Pass   |
| `ORD-1046` | `NEEDS_MORE_INFO`               | `MISSING`                  | `null`                            | Yes      | `OPERATIONS_DATA_REVIEW`      | Pass   |
| `ORD-1047` | `COMPLETED`                     | `COMPLETE`                 | `SHIPMENT_ALREADY_EXISTS`         | No       | `null`                        | Pass   |
| `ORD-1048` | `COMPLETED`                     | `COMPLETE`                 | `CAUSE_NOT_DETERMINED`            | Yes      | `GENERAL_COMMERCE_OPERATIONS` | Pass   |
| `ORD-1049` | `COMPLETED`                     | `COMPLETE`                 | `PAYMENT_NOT_CONFIRMED`           | Yes      | `PAYMENT_OPERATIONS`          | Pass   |
| `ORD-1050` | `NEEDS_MORE_INFO`               | `CONFLICTING`              | `null`                            | Yes      | `OPERATIONS_DATA_REVIEW`      | Pass   |

Exact suggested steps, confidence, matched rules, queues, escalation flags, and
`commerceStateChanged=false` also matched the frozen manifest for every row.

## Exact review outputs

### `ORD-1042`

```json
{
  "investigationStatus": "COMPLETED",
  "evidenceStatus": "COMPLETE",
  "diagnosisCode": "ASSIGNED_WAREHOUSE_OUT_OF_STOCK",
  "confidence": "CONFIRMED",
  "matchedRule": "assigned_warehouse_out_of_stock.v1",
  "shouldEscalate": true,
  "suggestedQueue": "FULFILMENT_OPERATIONS",
  "suggestedNextStep": "Review reassignment to an eligible warehouse; do not change commerce state automatically.",
  "eligibleAlternativeWarehouseIds": ["WH-B"],
  "commerceStateChanged": false
}
```

The selected shortage fact was required quantity `1`, available quantity `0`
at `WH-A/SKU-1042`. No stock was reserved and no fulfilment was reassigned.

### `ORD-1044`

```json
{
  "diagnosisCode": "WITHIN_EXPECTED_PROCESSING_TIME",
  "matchedRule": "within_expected_processing_time.v1",
  "processingStartedAt": "2026-07-30T10:30:00.000Z",
  "decisionReferenceAt": "2026-07-30T12:00:00.000Z",
  "elapsedMinutes": 90,
  "windowMinutes": 240,
  "shouldEscalate": false,
  "suggestedQueue": null,
  "commerceStateChanged": false
}
```

### `ORD-1046`

```json
{
  "investigationStatus": "NEEDS_MORE_INFO",
  "evidenceStatus": "MISSING",
  "diagnosisCode": null,
  "confidence": null,
  "matchedRule": null,
  "shouldEscalate": true,
  "suggestedQueue": "OPERATIONS_DATA_REVIEW",
  "suggestedNextStep": "Verify the missing assigned-warehouse inventory evidence.",
  "missingFields": ["inventory.assignedWarehouse.WH-A.SKU-1046"],
  "eligibleAlternativeWarehouseIds": [],
  "commerceStateChanged": false
}
```

### `ORD-1048`

```json
{
  "investigationStatus": "COMPLETED",
  "evidenceStatus": "COMPLETE",
  "diagnosisCode": "CAUSE_NOT_DETERMINED",
  "confidence": "CONFIRMED",
  "matchedRule": "cause_not_determined.v1",
  "shouldEscalate": true,
  "suggestedQueue": "GENERAL_COMMERCE_OPERATIONS",
  "suggestedNextStep": "Review the order manually without inventing a cause.",
  "commerceStateChanged": false
}
```

### `ORD-1050`

```json
{
  "investigationStatus": "NEEDS_MORE_INFO",
  "evidenceStatus": "CONFLICTING",
  "diagnosisCode": null,
  "confidence": null,
  "matchedRule": null,
  "shouldEscalate": true,
  "suggestedQueue": "OPERATIONS_DATA_REVIEW",
  "suggestedNextStep": "Resolve the conflicting inventory observations before suggesting a warehouse.",
  "conflictPath": "inventory.WH-A.SKU-1050.availableQuantity",
  "observedQuantities": [0, 4],
  "eligibleAlternativeWarehouseIds": [],
  "commerceStateChanged": false
}
```

No inventory source was selected as the winner.

## Automated checks

| Command / check                              | Expected                                | Actual                                                  | Result |
| -------------------------------------------- | --------------------------------------- | ------------------------------------------------------- | ------ |
| `bun install --frozen-lockfile`              | Lockfile current                        | 535 installs checked across 629 packages; no changes    | Pass   |
| `bun run db:verify-demo`                     | Approved seed; workflow empty           | Approved commerce counts; all five workflow counts zero | Pass   |
| `bun run db:verify-access`                   | Existing access/invariants pass         | 6 tests, 68 assertions                                  | Pass   |
| `bun run --filter @repo/db test`             | Database regression passes              | 7 tests, 104 assertions                                 | Pass   |
| `bun run --filter @repo/evidence test`       | Evidence regression passes              | 6 tests, 94 assertions                                  | Pass   |
| `bun run --filter @repo/diagnosis test`      | Pure and live diagnosis pass            | 18 tests, 147 assertions                                | Pass   |
| `bun run --filter @repo/diagnosis typecheck` | Strict package types                    | Exited successfully                                     | Pass   |
| `bun run build`                              | Workspace builds                        | 14/14 Turbo tasks                                       | Pass   |
| `bun run typecheck`                          | Workspace typechecks                    | 14/14 Turbo tasks                                       | Pass   |
| `bun run test`                               | Full regression passes                  | 20/20 Turbo tasks                                       | Pass   |
| `bun run lint`                               | Configured lint passes                  | 2/2 Turbo tasks                                         | Pass   |
| Formatting and `git diff --check`            | Formatted; no whitespace errors         | Passed                                                  | Pass   |
| Static import/scope inspection               | Diagnosis runtime imports schemas only  | Passed                                                  | Pass   |
| Clock/mutation inspection                    | No diagnosis clock, persistence, or DML | Passed                                                  | Pass   |

The first sandboxed diagnosis integration attempt represented all source reads
as failed because outbound hosted-database access was blocked. After the final
safety-invariant assertion was added, one hosted integration rerun terminated
its PostgreSQL connection unexpectedly after all 17 pure tests passed. The same
unchanged suite then passed 18 tests and 147 assertions, and the final root
suite passed. These were execution-environment diagnostics, not product or data
failures.

## Manual verification

- Inspected the exact nine live decisions and compared them with
  `approvedScenarioManifest`.
- Inspected `ORD-1042` selected facts and `["WH-B"]`.
- Inspected `ORD-1044` event ID, start/reference timestamps, 90 elapsed
  minutes, and 240-minute window.
- Inspected `ORD-1046` and `ORD-1050` null diagnosis/confidence/rule fields.
- Inspected `ORD-1048` fallback rule and no-invented-cause guidance.
- Compared persisted fixtures and row-count summaries before and after live
  evaluation; they were identical.

## Guardrails verified

- Diagnosis runtime imports only `@repo/schemas`.
- It imports no DB, Prisma, evidence runtime, fixtures, workflow, MCP, agent,
  application, network, environment, or clock code.
- Both inputs and every returned decision are Zod-validated.
- A `SUCCEEDED` failure-type event is not decisive.
- The engine contains no `Date.now()` and uses no real-time clock.
- Elapsed time uses `evidence.collectedAt` and internally valid event
  chronology.
- Supporting facts are selected, finite, safe, JSON-serializable, and
  deterministically ordered.
- No source payload, event details, raw error, SQL, credential, or hidden
  reasoning is copied into a decision.
- Live evaluation used `WORKFLOW_DATABASE_URL`.
- Commerce remained unchanged and all workflow tables remained empty.
- No database write, operational action, API route, MCP behavior, LLM
  behavior, or seed/reset runtime path was added.

## Files and packages changed

### Schemas

- `packages/schemas/investigation-decision.ts`
- `packages/schemas/index.ts`

### Diagnosis engine

- `packages/diagnosis/engine.ts`
- `packages/diagnosis/index.ts`

### Readiness correction

- `packages/diagnosis/readiness.ts`

### Tests

- `packages/diagnosis/tests/engine.test.ts`
- `packages/diagnosis/tests/readiness.test.ts`
- `packages/diagnosis/tests/integration.test.ts`

### Documentation

- `AGENTS.md`
- `README.md`
- `docs/architecture/package-graph.md`
- `docs/database/client-review-summary.md`
- `docs/evaluations/phase-07-evidence-readiness.md`
- `docs/evaluations/phase-08-diagnosis-engine.md`

No migration, Prisma schema, generated Prisma file, lockfile, environment file,
package manifest, seed/reset implementation, API, or application file changed.
Build-generated ignored `dist` files are not workspace entry points and are not
part of the review diff.

## Known limitations

- The engine returns an in-memory decision only; Phase 9 owns persistence,
  idempotency, audit events, workflow transactions, and review-case creation.
- No source-age expiry threshold is approved; source timestamps remain trace
  metadata.
- The diagnosis package does not collect evidence itself; the later workflow
  layer will compose the accepted collector, readiness evaluator, and engine.
- Hosted integration checks require access to the configured database.

## Decisions changed during review

- Phase 7 was accepted and merged as `d7999c7`.
- Phase 8 was accepted and merged to `main` as
  `8f76a0c8a750db6f006635a7f843b34de6944bec`.
- The client-approved synthetic-data/time policy was recorded without changing
  the commerce read-only or escalation boundary.
- The Phase 7 decisive-event predicate was corrected to require both an
  approved failure type and `status=FAILED`.
- No accepted schema, migration, permission, scenario, or package-dependency
  direction changed.

## Proposed commit and PR

Commit:

```text
feat(diagnosis): add deterministic diagnosis engine
```

PR title:

```text
add deterministic diagnosis and suggested actions
```

No commit or push was performed.

## Exit decision

Accepted.
