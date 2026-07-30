# Phase 06 Evaluation Report - Evidence Collection and Normalization

## Goal

Collect all scoped commerce evidence through the accepted read-only repository
and return one deterministic, serializable, Zod-validated snapshot without
classifying or persisting it.

## Scope implemented

- Added a schema-version-1 normalized evidence contract.
- Added ordered source-read metadata for all eight approved sources.
- Added an evidence collector with an injected repository and clock.
- Added concurrent order-scoped reads followed by dependent inventory and
  warehouse reads.
- Added safe source-failure and dependency-skip handling.
- Added focused fake-repository tests and a live restricted-role integration.

No readiness status, missing-field list, conflict result, freshness decision,
diagnosis, escalation, persistence, MCP, or LLM behavior was added.

## Normalized snapshot contract

`NormalizedOrderEvidence` contains:

- `schemaVersion`, `orderId`, and `collectedAt`;
- order, order items, current payment, current fulfilment, fulfilment events,
  current shipment, inventory observations, and warehouses;
- exactly eight `sourceReads`, in the fixed order `ORDER`, `ORDER_ITEMS`,
  `PAYMENT`, `FULFILMENT`, `FULFILMENT_EVENTS`, `SHIPMENT`, `INVENTORY`,
  `WAREHOUSES`.

Every source read records its status, injected `readAt`, latest source
timestamp, record count, and safe error code. The final object is parsed
through `NormalizedOrderEvidenceSchema`, which also verifies source order and
record-count consistency.

## Collection order

Stage 1 concurrently attempts the six order-scoped reads. Stage 2 deduplicates
and sorts SKUs from successful order-item evidence before reading inventory,
then derives, deduplicates, and sorts warehouse IDs from the successful
fulfilment and inventory results.

Records are normalized deterministically without filtering inactive
warehouses, aggregating inventory, or discarding conflicting observations.

## Source failure versus successful absence

- `SUCCEEDED`: preserves a singular `null` or collection `[]`, records the
  actual count, and has no error code.
- `FAILED`: exposes no source value, records `SOURCE_READ_FAILED`, and never
  includes a raw exception or connection detail.
- `SKIPPED`: is used only for an unavailable dependency. Inventory uses
  `ORDER_ITEMS_UNAVAILABLE`; warehouses use `WAREHOUSE_IDS_UNAVAILABLE`.

A successfully empty order-item result still invokes inventory with an empty
SKU list and produces a successful empty inventory read.

## Public `@repo/evidence` surface

- `EvidenceCollector`
- `EvidenceClock`
- `createEvidenceCollector({ commerce, clock? })`

The package constructs no Prisma or database client. Its runtime imports only
the `CommerceReadRepository` type from `@repo/db` and public contracts from
`@repo/schemas`.

## Automated checks

| Command / check                             | Expected                                    | Actual                                                       | Result |
| ------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------ | ------ |
| `bun install --frozen-lockfile`             | Lockfile is current                         | 535 installs checked across 629 packages; no changes         | Pass   |
| `bun run db:verify-demo`                    | Approved seed; workflow tables empty        | Approved commerce counts; all five workflow counts zero      | Pass   |
| `bun run db:verify-access`                  | Existing role/invariant guardrails pass     | 6 tests, 68 assertions                                       | Pass   |
| `bun run --filter @repo/db test`            | Phase 5 repository regression passes        | 7 tests, 104 assertions                                      | Pass   |
| `bun run --filter @repo/evidence test`      | Unit and live collection tests pass         | 4 tests, 81 assertions                                       | Pass   |
| `bun run --filter @repo/evidence typecheck` | Evidence package is strict-type safe        | Exited successfully                                          | Pass   |
| `bun run build`                             | Workspace builds                            | 14/14 Turbo tasks                                            | Pass   |
| `bun run typecheck`                         | Workspace typechecks                        | 14/14 Turbo tasks                                            | Pass   |
| `bun run test`                              | Full regression passes                      | 19/19 Turbo tasks; evidence 4/4 and database 7/7             | Pass   |
| `bun run lint`                              | Configured lint tasks pass                  | 2/2 Turbo tasks                                              | Pass   |
| Formatting and `git diff --check`           | Changed files are formatted; no whitespace  | Passed after formatting                                      | Pass   |
| Scope and import inspection                 | No Prisma, persistence, or forbidden fields | Collector has no Prisma/write imports or classified outcomes | Pass   |

## Manual verification and representative evidence

The live test used `createWorkflowRepositoryContext()` and the real collector
with the configured restricted `WORKFLOW_DATABASE_URL`.

| Order      | Preserved normalized evidence                                                                                                           |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `ORD-1042` | Payment `SUCCEEDED`; fulfilment `ON_HOLD` at `WH-A`; inventory `WH-A=0`, `WH-B=3`; shipment `null`; all eight reads succeeded           |
| `ORD-1046` | Fulfilment remains assigned to `WH-A`; inventory is a successful empty collection with count zero, not an invented zero-quantity record |
| `ORD-1050` | Both `WH-A/SKU-1050` observations remain: `WAREHOUSE_SYSTEM=0` and `COMMERCE_SYSTEM=4`; neither source is selected over the other       |

Spot checks also preserved the `ORD-1043` fulfilment-creation-failure event,
the existing `ORD-1047` shipment, and the authoritative `ORD-1049` payment
status `PROCESSING`.

## Guardrails verified

- Repository dependencies are injected; the evidence package creates no
  database connection.
- `packages/evidence` does not import Prisma.
- All live collector reads used the restricted workflow context.
- The integration rechecked the demo summary after collection; all five
  operations workflow counts remained zero.
- No migration, database schema, API wiring, generic query, commerce mutation,
  or operations write was added.
- Snapshots contain no evidence classification or diagnosis fields.
- Raw thrown errors are discarded and tested not to leak into snapshots.

## Files and packages changed

### Schemas

- `packages/schemas/normalized-evidence.ts`
- `packages/schemas/index.ts`

### Evidence package

- `packages/evidence/collector.ts`
- `packages/evidence/index.ts`
- `packages/evidence/package.json`
- `packages/evidence/tsconfig.json`
- `packages/evidence/tsconfig.build.json`
- `bun.lock`

### Tests

- `packages/evidence/tests/collector.test.ts`
- `packages/evidence/tests/integration.test.ts`

### Documentation

- `AGENTS.md`
- `README.md`
- `docs/architecture/package-graph.md`
- `docs/evaluations/phase-05-readonly-commerce-repositories.md`
- `docs/evaluations/phase-06-evidence-collector.md`

## Known limitations

- Phase 7 must decide whether evidence is complete, missing, conflicting, or
  stale and must produce field-level explanations.
- Phase 8 owns deterministic diagnosis and suggested action.
- Operations repositories, workflow persistence, audit records, escalation,
  MCP transport, and AI-host behavior remain deferred.
- Hosted integration checks require network access to the configured database.

## Decisions changed during review

The latest Phase 6 prompt supersedes the older plan wording that associated
warehouse eligibility with collection. Phase 6 preserves warehouses and source
metadata only; eligibility, readiness, conflict, and freshness decisions remain
deferred.

## Proposed commit

`feat(evidence): collect normalized order evidence`

No commit or push was performed.

## Exit decision

Awaiting review.
