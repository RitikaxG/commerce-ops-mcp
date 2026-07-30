# Phase 09 Evaluation Report - Persistent Investigation and Escalation

## Goal

Compose the accepted commerce repository, evidence collector, readiness gate,
and deterministic diagnosis engine into an atomic persistent workflow. Create a
human-review case only through a separate explicit call, preserve exact
idempotency responses, expose safe read-only case/trace queries, and keep all
commerce state read-only.

## Scope implemented

- Added versioned Zod contracts for investigation and escalation inputs and
  results, persisted investigations/evidence/cases, safe audit events, traces,
  queries, review reasons, and finite workflow errors.
- Extended the restricted repository context with a narrow
  `OperationsWorkflowRepository`.
- Added atomic commands for successful investigations, technical failures,
  client-request idempotency attachment, case creation, and case reuse.
- Added exact request hashing and stored-response validation for
  `investigate_order_exception` and `create_human_review_escalation`.
- Added safe deterministic audit builders and a read-only trace reader.
- Added `CommerceOperationsWorkflow`, a dependency-injected unit-test factory,
  and a runtime factory using `WORKFLOW_DATABASE_URL`.
- Added an explicit owner-only, non-production workflow-demo cleanup command.
- Preserved the exact approved `ORD-1046` missing-inventory guidance while
  correcting every other valid missing-evidence result to generic commerce
  evidence guidance.

Investigation never creates a review case automatically. Escalation accepts
only investigation ID and idempotency key; order, queue, reason, and suggested
step are derived from the stored terminal investigation.

No migration, grant, Prisma schema, commerce fixture, MCP, LLM, Express route,
API composition, or web-viewer change was required.

## Files and packages changed

### Root and database

- `package.json`
- `packages/db/package.json`
- `packages/db/index.ts`
- `packages/db/commerce-repository.ts`
- `packages/db/operations-repository.ts`
- `packages/db/testing.ts`
- `packages/db/scripts/reset-workflow-demo.ts`
- `packages/db/tests/operations-repository.test.ts`

### Schemas, diagnosis, and observability

- `packages/schemas/index.ts`
- `packages/schemas/investigation-decision.ts`
- `packages/schemas/workflow.ts`
- `packages/diagnosis/engine.ts`
- `packages/diagnosis/tests/engine.test.ts`
- `packages/observability/index.ts`
- `packages/observability/package.json`
- `packages/observability/tsconfig.json`
- `packages/observability/tsconfig.build.json`
- `packages/observability/tests/observability.test.ts`

### Workflow

- `packages/workflow/index.ts`
- `packages/workflow/package.json`
- `packages/workflow/tsconfig.json`
- `packages/workflow/tsconfig.build.json`
- `packages/workflow/tests/workflow.test.ts`
- `packages/workflow/tests/integration.test.ts`

### Documentation

- `AGENTS.md`
- `README.md`
- `docs/architecture/package-graph.md`
- `docs/database/client-review-summary.md`
- `docs/evaluations/phase-08-diagnosis-engine.md`
- `docs/evaluations/phase-09-persistence-escalation.md`

Build-generated ignored `dist` files remain non-entry-point artifacts and are
not part of the review diff.

## Automated checks

| Command                                                                              | Expected                                                                         | Actual                                                                 | Result |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------ |
| `bun install --frozen-lockfile`                                                      | Existing lockfile resolves without change                                        | 535 installs checked across 629 packages; no changes                   | Pass   |
| `bun run db:verify-demo`                                                             | Nine approved commerce orders and zero workflow rows                             | Approved commerce counts matched; all five operations counts were zero | Pass   |
| `bun run db:verify-access`                                                           | Restricted role and database invariants remain enforced                          | 6 tests passed, 68 assertions                                          | Pass   |
| `bun run --filter @repo/db test`                                                     | Repository atomicity, rollback, permissions, invariants, and commerce reads pass | 10 tests passed, 110 assertions                                        | Pass   |
| `bun run --filter @repo/evidence test`                                               | Collector regressions pass                                                       | 6 tests passed, 94 assertions                                          | Pass   |
| `bun run --filter @repo/diagnosis test`                                              | Readiness, diagnosis, and generic-missing correction pass                        | 19 tests passed, 150 assertions                                        | Pass   |
| `bun run --filter @repo/observability test`                                          | Safe event order and trace absence behavior pass                                 | 2 tests passed, 7 assertions                                           | Pass   |
| `bun run --filter @repo/workflow test`                                               | Unit, nine-scenario, query, idempotency, failure, and concurrency behavior pass  | 12 tests passed, 167 assertions                                        | Pass   |
| `bun run build`                                                                      | All workspace builds succeed                                                     | 14/14 Turbo tasks succeeded                                            | Pass   |
| `bun run typecheck`                                                                  | Strict TypeScript succeeds                                                       | 14/14 Turbo tasks succeeded                                            | Pass   |
| `bun run test`                                                                       | Full repository regression succeeds                                              | 22/22 Turbo tasks succeeded                                            | Pass   |
| `bun run lint`                                                                       | Configured lint tasks succeed                                                    | 2/2 Turbo tasks succeeded                                              | Pass   |
| Prettier check and `git diff --check`                                                | Changed source and docs are formatted with no whitespace errors                  | No formatting or whitespace errors                                     | Pass   |
| Import, migration, generated-file, runtime-cleanup, and commerce-mutation guardrails | No boundary broadening                                                           | All checks returned the expected empty/approved result                 | Pass   |
| `bun run db:reset-workflow-demo` followed by final count verification                | Only operations rows are cleared and all five counts become zero                 | All five operations counts were zero; commerce counts stayed approved  | Pass   |

Database and live tests required normal network access to the configured hosted
PostgreSQL database. One diagnostic full-suite attempt overlapped with a stale
test runner retained by the execution wrapper and caused the commerce fixture
reset test to observe a concurrent shipment row. The stale runner was stopped,
workflow rows were cleared, approved commerce fixtures were restored and
verified, and the clean isolated full suite then passed 22/22 tasks. The failed
overlapped diagnostic is not counted as a verification pass.

## Manual verification

- Confirmed Phase 8 was accepted and merged at
  `8f76a0c8a750db6f006635a7f843b34de6944bec` before implementation.
- Inspected the final plan persistence/orchestration phase and the complete
  Phase 9 prompt.
- Confirmed the existing Prisma schema, grants, and deferred triggers already
  supported Phase 9; no migration or grant broadening was needed.
- Confirmed `apps/api` imports neither `@repo/workflow` nor database runtime
  composition.
- Confirmed runtime workflow code imports neither fixtures nor the owner-only
  testing cleanup entry point.
- Confirmed Prisma and generated-client imports remain confined to
  `packages/db`.
- Confirmed the only static raw SQL added is the owner-only testing cleanup
  `TRUNCATE` over all five operations tables together.

## Guardrails verified

- Commerce reads use the restricted workflow role and no workflow code exposes
  or invokes commerce insert, update, delete, truncate, reservation,
  reassignment, retry, or shipment creation.
- Investigation writes one terminal investigation, one immutable evidence
  snapshot, ordered safe audits, and one idempotency response atomically.
- Missing or conflicting evidence persists `NEEDS_MORE_INFO` with no guessed
  diagnosis.
- Anchored technical failures persist `FAILED` without evidence or diagnosis;
  raw exceptions, SQL, credentials, and stacks are not returned or audited.
- Unknown orders and unavailable anchor reads create no operations record.
- Investigation does not create a review case.
- Escalation is rejected for `WITHIN_EXPECTED_PROCESSING_TIME`,
  `SHIPMENT_ALREADY_EXISTS`, missing/nonterminal investigations, and
  inconsistent non-actionable outcomes.
- Exact retries return the stored response without a write or audit event.
- Client-request reuse and case reuse do not duplicate the logical resource.
- Evidence and audit records remain immutable/append-only under live database
  tests.
- Case and trace reads perform no write and add no audit event.
- Every public investigation and escalation result reports
  `commerceStateChanged=false`.

## Sample output / IDs / trace evidence

The live nine-scenario test observed:

| Stage                                 | Investigations | Evidence | Cases | Idempotency |
| ------------------------------------- | -------------: | -------: | ----: | ----------: |
| After nine investigations             |              9 |        9 |     0 |           9 |
| After seven eligible escalation calls |              9 |        9 |     7 |          16 |
| After a second-key case reuse         |              9 |        9 |     7 |          17 |
| Final owner-only cleanup              |              0 |        0 |     0 |           0 |

- `ORD-1046` persisted `NEEDS_MORE_INFO` / `MISSING`, no diagnosis, exact
  missing path `inventory.assignedWarehouse.WH-A.SKU-1046`, and the approved
  inventory-verification step.
- `ORD-1050` persisted `NEEDS_MORE_INFO` / `CONFLICTING`, no diagnosis, and one
  structured inventory quantity conflict.
- Cases were created only for `ORD-1042`, `ORD-1043`, `ORD-1045`, `ORD-1046`,
  `ORD-1048`, `ORD-1049`, and `ORD-1050`.
- `ORD-1044` and `ORD-1047` returned `ESCALATION_NOT_ALLOWED`.
- A second escalation key returned `disposition=REUSED` with the original case
  ID and one `HUMAN_REVIEW_CASE_REUSED` audit event.
- Concurrent same-key investigations and escalations returned one shared
  resource; a different-input same-key race produced one winner and one
  `IDEMPOTENCY_KEY_REUSE`.

## Known limitations

- Phase 9 exposes package APIs only. MCP transport, Express workflow routes,
  agent behavior, model evaluations, and the web trace viewer remain deferred.
- The runtime uses the fixed approved demo evidence clock; production
  freshness policy remains unapproved and out of scope.
- Human reviewer status changes and reopening closed cases remain out of
  scope.
- The schema-owner cleanup command is intentionally destructive to demo
  operations rows and blocked when `NODE_ENV=production`; runtime credentials
  cannot invoke it.
- Hosted integration tests require the configured PostgreSQL role URLs.

## Decisions changed during review

- Phase 8 was accepted and merged as
  `8f76a0c8a750db6f006635a7f843b34de6944bec`.
- Non-`ORD-1046` missing evidence now receives the exact generic guidance:
  `Verify the missing commerce evidence identified in the investigation.`
- No accepted schema, migration, permission, scenario, or dependency direction
  changed.
- Explicit workflow cleanup was added through a separate testing entry point;
  the existing commerce `db:reset-demo` contract was not changed.

## Proposed commit and PR

Commit:

```text
feat(workflow): persist investigations and escalations
```

PR title:

```text
add persistent investigation and human-review workflows
```

No commit or push was performed.

## Exit decision

Awaiting review.
