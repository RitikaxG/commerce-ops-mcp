# Phase 03 Evaluation Report — Approved Synthetic Scenarios and Seed Data

## Goal

Implement the nine client-approved synthetic investigation scenarios as typed, Zod-validated commerce fixtures; persist their starting evidence in PostgreSQL through atomic explicit seed/reset commands; and prove that no workflow records or operational fixes are seeded.

## Scope and plan reconciliation

The final Phase 3 prompt supersedes the original plan split by requiring PostgreSQL seed/reset in this phase. Phase 3 therefore absorbs the minimum accepted Prisma schema and migration formerly scheduled for Phase 4.

One approved schema amendment is necessary for `ORD-1050`: `commerce.inventory_levels` now stores source-specific observations keyed by `(warehouse_id, sku, source_system)`. This allows both `WAREHOUSE_SYSTEM = 0` and `COMMERCE_SYSTEM = 4` to remain persisted. The table name is retained to minimize change to the accepted entity boundary.

The following remain out of scope:

- evidence collection and normalization;
- evidence readiness and diagnosis rules;
- workflow investigation/escalation creation;
- MCP tools, LLM behavior, trace UI, and agent orchestration;
- runtime database wiring and commerce mutation capabilities;
- dedicated database roles/grants and advanced cross-table constraint triggers.

## Client-approved scenario contract

| Order      | Evidence      | Investigation     | Diagnosis                         | Escalate | Queue                         |
| ---------- | ------------- | ----------------- | --------------------------------- | -------- | ----------------------------- |
| `ORD-1042` | `COMPLETE`    | `COMPLETED`       | `ASSIGNED_WAREHOUSE_OUT_OF_STOCK` | Yes      | `FULFILMENT_OPERATIONS`       |
| `ORD-1043` | `COMPLETE`    | `COMPLETED`       | `FULFILMENT_CREATION_FAILED`      | Yes      | `FULFILMENT_OPERATIONS`       |
| `ORD-1044` | `COMPLETE`    | `COMPLETED`       | `WITHIN_EXPECTED_PROCESSING_TIME` | No       | —                             |
| `ORD-1045` | `COMPLETE`    | `COMPLETED`       | `SHIPMENT_LABEL_CREATION_FAILED`  | Yes      | `SHIPPING_OPERATIONS`         |
| `ORD-1046` | `MISSING`     | `NEEDS_MORE_INFO` | None                              | Yes      | `OPERATIONS_DATA_REVIEW`      |
| `ORD-1047` | `COMPLETE`    | `COMPLETED`       | `SHIPMENT_ALREADY_EXISTS`         | No       | —                             |
| `ORD-1048` | `COMPLETE`    | `COMPLETED`       | `CAUSE_NOT_DETERMINED`            | Yes      | `GENERAL_COMMERCE_OPERATIONS` |
| `ORD-1049` | `COMPLETE`    | `COMPLETED`       | `PAYMENT_NOT_CONFIRMED`           | Yes      | `PAYMENT_OPERATIONS`          |
| `ORD-1050` | `CONFLICTING` | `NEEDS_MORE_INFO` | None                              | Yes      | `OPERATIONS_DATA_REVIEW`      |

`expectedCommerceStateChanged` is `false` for every manifest entry.

## Files and packages changed

### Repository commands and lockfile

- `package.json`
- `bun.lock`

### Configuration

- `packages/config/env.ts`
- `packages/config/index.ts`
- `packages/config/tests/env.test.ts`

### Shared schemas

- `packages/schemas/approved-scenario.ts`
- `packages/schemas/commerce-fixtures.ts`
- `packages/schemas/index.ts`
- `packages/schemas/package.json`
- `packages/schemas/tsconfig.json`

### Fixtures, validation, scripts, and tests

- `packages/fixtures/commerce.ts`
- `packages/fixtures/manifest.ts`
- `packages/fixtures/persistence.ts`
- `packages/fixtures/reference-time.ts`
- `packages/fixtures/validation.ts`
- `packages/fixtures/index.ts`
- `packages/fixtures/scripts/output.ts`
- `packages/fixtures/scripts/seed.ts`
- `packages/fixtures/scripts/reset.ts`
- `packages/fixtures/scripts/verify.ts`
- `packages/fixtures/tests/database.test.ts`
- `packages/fixtures/tests/manifest.test.ts`
- `packages/fixtures/tests/scenarios.test.ts`
- `packages/fixtures/tests/startup-guard.test.ts`
- `packages/fixtures/tests/validation.test.ts`
- `packages/fixtures/package.json`
- `packages/fixtures/tsconfig.json`
- `packages/fixtures/tsconfig.build.json`

### Database

- `packages/db/client.ts`
- `packages/db/demo-data.ts`
- `packages/db/index.ts`
- `packages/db/package.json`
- `packages/db/tsconfig.json`
- `packages/db/tsconfig.build.json`
- `packages/db/prisma/schema.prisma`
- `packages/db/prisma/migrations/migration_lock.toml`
- `packages/db/prisma/migrations/20260730160000_approved_synthetic_scenarios/migration.sql`

The ignored generated Prisma client was regenerated locally but is not a commit deliverable.

### Source-first workspace export review correction

- `apps/api/package.json`
- `apps/api/tsconfig.build.json` removed because the API build now uses Bun's
  Node-targeted bundler
- `packages/agent/package.json`
- `packages/config/package.json`
- `packages/db/package.json`
- `packages/diagnosis/package.json`
- `packages/evaluations/package.json`
- `packages/evidence/package.json`
- `packages/fixtures/package.json`
- `packages/mcp/package.json`
- `packages/observability/package.json`
- `packages/schemas/package.json`
- `packages/ui/package.json`
- `packages/workflow/package.json`

Every internal workspace package now exports its TypeScript source rather than
using generated `dist` files as the generic default. Builds can still emit
artifacts, but package consumers do not depend on them. The API is bundled from
source with Bun's Node target so `node dist/server.js` remains the production
runtime boundary.

### Documentation

- `AGENTS.md`
- `README.md`
- `docs/architecture/package-graph.md`
- `docs/database/client-review-summary.md`
- `docs/database/schema-proposal.md`
- `docs/evaluations/phase-02.md`
- `docs/evaluations/phase-03-synthetic-scenarios.md`
- `docs/plans/how-to-use-phase-prompts.md`
- `docs/scenarios/approved-synthetic-scenarios.md`
- `docs/workflow-contract.md`

## Public interfaces

- `@repo/schemas`
  - approved scenario Zod schema and inferred types;
  - commerce fixture entity/set Zod schemas and inferred types.
- `@repo/fixtures`
  - frozen scenario manifest and approved order IDs;
  - validated commerce fixtures;
  - fixed reference time and processing-window helper;
  - pure shape/relationship validation;
  - explicit seed/reset/verify composition.
- `@repo/db`
  - transactional seed/reset;
  - scoped read-back and row-count summary.

The Prisma client and adapter remain private to `packages/db`.

## Schema assumptions and implementation

- PostgreSQL uses the accepted `commerce` and `operations` schemas.
- Human-readable IDs remain PostgreSQL `text` / Prisma `String`.
- Payment, fulfilment, and shipment remain zero-or-one current records per order.
- Inventory observations add `source_system` to their key.
- Missing inventory remains absence, not quantity zero.
- PostgreSQL enums, foreign keys, indexes, uniqueness, quantity checks, timestamp checks, same-row lifecycle checks, and JSON shape checks are included in the migration.
- The migration creates operations tables so their emptiness can be verified; the seed inserts only commerce records.
- Migration and seed/reset currently use the configured development/schema-owner credential. Runtime and dedicated seed roles remain unimplemented.

## Automated checks

| Command                                            | Expected                                                                             | Actual                                                             | Result |
| -------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------ | ------ |
| `bun install`                                      | Install declared Prisma adapter/client and workspace dependencies using Bun          | 535 installs checked across 629 packages; no changes on final run  | Pass   |
| `bun run db:generate`                              | Generate the ignored local Prisma client                                             | Prisma Client 7.9.1 generated successfully                         | Pass   |
| Prisma format/validate                             | Schema is formatted and valid                                                        | Schema valid                                                       | Pass   |
| `bun run db:migrate`                               | Apply one reviewed migration to the initially empty database                         | `20260730160000_approved_synthetic_scenarios` applied successfully | Pass   |
| `bun run db:seed`                                  | Validate before writing, seed all commerce rows atomically, seed no workflow rows    | Seed succeeded; row counts shown below; workflow counts all zero   | Pass   |
| Fixture unit/scenario/relationship/startup tests   | All approved and negative cases pass                                                 | 29 passed, 0 failed before database test                           | Pass   |
| `bun run --filter @repo/fixtures test:integration` | Prove exact read-back, atomic rollback, reset restoration, and empty workflow tables | 1 passed, 0 failed                                                 | Pass   |
| `bun run db:reset-demo`                            | Explicit helper restores only approved demo starting state                           | Reset succeeded with approved counts and zero workflow records     | Pass   |
| `bun run db:verify-demo`                           | Read back final row counts without mutation                                          | Approved counts returned; all workflow counts zero                 | Pass   |
| `bun run build`                                    | Turbo builds every configured workspace                                              | 14 successful, 14 total                                            | Pass   |
| `bun run typecheck`                                | Turbo typechecks every configured workspace                                          | 14 successful, 14 total                                            | Pass   |
| `bun run test`                                     | Turbo runs API, config, fixture, and PostgreSQL tests                                | 17 successful Turbo tasks; fixtures 30/30, config 4/4, API 1/1     | Pass   |
| `bun run lint`                                     | Existing lint-enabled packages pass                                                  | 2 successful, 2 total                                              | Pass   |
| Formatting and `git diff --check`                  | No formatting or whitespace errors                                                   | No errors                                                          | Pass   |

### Source-first export review verification

| Command/check                             | Expected                                                       | Actual                                                                                                                                              | Result      |
| ----------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| Package-export scan                       | No internal workspace export resolves through `dist`           | All package entry points resolve to root TypeScript source                                                                                          | Pass        |
| `bun install --frozen-lockfile`           | Manifests remain lockfile-consistent                           | 535 installs checked across 629 packages; no changes                                                                                                | Pass        |
| `bun run build`                           | Source-first workspaces and the Node-targeted API bundle build | 14 successful, 14 total; API bundled 227 modules                                                                                                    | Pass        |
| `bun run typecheck`                       | Source-first package imports typecheck                         | 14 successful, 14 total                                                                                                                             | Pass        |
| `bun run lint`                            | Existing lint-enabled packages pass                            | 2 successful, 2 total                                                                                                                               | Pass        |
| Built API health request                  | `node apps/api/dist/server.js` returns readiness               | HTTP 200 with `{"status":"ok"}`                                                                                                                     | Pass        |
| `bun run db:verify-demo`                  | Existing approved data remains readable and unchanged          | Approved commerce counts; every workflow count zero                                                                                                 | Pass        |
| Root and isolated integration test reruns | Previously passing suite remains green                         | API, config, and 29 non-database fixture tests passed; the remote PostgreSQL transaction exceeded Prisma's five-second timeout and returned `P2028` | Needs rerun |

The source-export correction changes package manifests and API build
composition only; it does not change the database client, fixture data, or
transaction implementation. The PostgreSQL integration test passed before this
correction. Its review rerun first timed out waiting to begin a transaction and
then timed out after remote latency caused the transaction to exceed five
seconds. Read-only verification immediately afterward succeeded with the
approved counts.

## Diagnostic failures retained

- Initial dependency installation inside the managed sandbox could not write its temporary directory; the same Bun install succeeded outside the sandbox.
- A Phase 3 review found that internal package export maps still used generated
  `dist/index.js` files as their generic default. Those maps were corrected to
  source-first TypeScript exports, and the API build was changed to a
  Node-targeted Bun bundle so the Node.js runtime contract remains intact.
- The first root `db:generate` script used an unsupported Bun working-directory invocation. It was replaced with the existing workspace-filter convention and passed.
- The initial startup-guard test resolved one parent directory too far. Its repository-relative path was corrected, after which all non-database fixture tests passed.
- An empty `@repo/schemas` test script returned “No tests found”; it was removed because schema behavior is exercised by the fixture validation suite.
- A migration-status check from the repository root could not locate `packages/db/prisma.config.ts`; rerunning from `packages/db` reported the database up to date.
- The first documentation-format command was launched from `packages/db`, so root-relative paths did not match. It was rerun from the repository root and the final formatting check passed.
- The initial seed emitted the node-postgres future SSL-alias warning. Database construction now normalizes `sslmode=require` to the equivalent explicit `verify-full` behavior without changing the ignored local environment file.

## Persisted row counts

```json
{
  "commerce": {
    "orders": 9,
    "orderItems": 9,
    "payments": 9,
    "warehouses": 2,
    "inventoryObservations": 8,
    "fulfilments": 7,
    "fulfilmentEvents": 14,
    "shipments": 1
  },
  "workflow": {
    "investigations": 0,
    "investigationEvidence": 0,
    "humanReviewEscalations": 0,
    "idempotencyRecords": 0,
    "auditEvents": 0
  }
}
```

## Manual verification

- Confirmed the configured PostgreSQL database was empty before migration.
- Inspected the generated migration and added reviewed checks not expressible in Prisma schema syntax.
- Inspected seed, reset, and verify output.
- Confirmed `ORD-1046` has no `WH-A/SKU-1046` observation.
- Confirmed `ORD-1050` read-back contains two source rows with quantities `0` and `4`.
- Confirmed `ORD-1044` and `ORD-1047` are the only non-escalation scenarios.
- Confirmed API startup does not import or invoke seed/reset behavior.
- Confirmed the final database migration status is up to date.

## Guardrails verified

- Zod validation runs before the transaction opens.
- Duplicate IDs, empty IDs, invalid statuses/timestamps/source systems, negative inventory, and non-positive item quantities are rejected.
- Invalid order/warehouse relations, cross-order shipment/fulfilment links, unsupported null event fulfilments, and undeclared demo orders are rejected.
- The forced unique-constraint failure rolled back the reset transaction and preserved the previous complete starting state.
- Missing evidence is absence, not zero.
- Conflicting evidence is represented by separate persisted observations.
- Seed/reset inserts no operations-workflow row.
- API startup does not seed or reset.
- No fixture or script reassigns a warehouse, reserves inventory, releases a hold, retries fulfilment, creates a missing shipment, or changes authoritative payment state.
- No diagnosis engine, MCP tool, LLM behavior, workflow service, or trace UI was added.
- The Prisma client is not exported.

## Known limitations

- Runtime database roles/grants and forbidden-commerce-DML tests are not yet implemented.
- Advanced accepted cross-table constraint triggers and defensive immutability/append-only enforcement remain for the reconciled database-hardening phase.
- The configured prototype database uses development/schema-owner credentials for migration and explicit non-production seed/reset.
- `db:seed` expects an empty approved demo data set; use `db:reset-demo` for repeatable restoration.
- Manifest diagnoses and queue expectations are acceptance contracts only; no diagnosis or escalation workflow executes them yet.
- The original Phase 4 prompt must be revised so it does not recreate schema/seed work completed here.

## Decisions changed during review

- The final Phase 3 prompt moves the minimum schema/migration/seed work forward from Phase 4.
- Inventory identity adds source system for the approved persisted conflict.
- The historical `inventory_levels` table name is retained while TypeScript uses “inventory observation”.
- Fixed time is `2026-07-30T12:00:00.000Z`; the fixture window is four hours.
- Explicit development/schema-owner credentials are used only for migration and non-production seed/reset.

## Git checkpoint

- Branch: `phase/03-approved-synthetic-scenarios`
- Base commit: `1a53d26` (`package setup`)
- Proposed commit: `feat(fixtures): add approved commerce investigation scenarios`
- No commit or push was performed.

## Exit decision

Awaiting review.
