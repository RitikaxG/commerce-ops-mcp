# AGENTS.md

## Product goal

Diagnose why a paid order has not reached shipment creation and create a persistent human-review escalation.

## Current gate

- Phase 0 was reviewed and accepted on 2026-07-30.
- Phase 1 was reviewed and accepted on 2026-07-30.
- Phase 2 was committed and accepted for Phase 3 to begin on 2026-07-30.
- Phase 3 was accepted and merged to `main` in commit `13e4aaa` on 2026-07-30.
- Phase 4 was accepted and merged to `main` in commit `97fcf99` on 2026-07-30.
- Phase 5 read-only commerce repositories are implemented on `phase/05-readonly-commerce-repositories` and awaiting review.
- The next permitted action is Phase 5 review or revision.
- Phase 6 and later phases remain blocked until Phase 5 is explicitly accepted.
- Use one phase prompt in one coding session and stop at its review gate.
- Do not start Phase 6 automatically.

## Permanent safety boundary

- Operational commerce state is read-only.
- Allowed writes are limited to the operations workflow: investigations, immutable evidence snapshots, human-review escalations, idempotency records, and append-only audit events.
- Forbidden: order, payment, inventory, fulfilment, event, or shipment mutation; raw SQL tools; unrestricted API tools; or claims that an operational fix was executed.
- A recommendation is a proposal for human review, never evidence that an operational action occurred.
- Observable audit activity may be stored. Hidden model chain of thought must not be stored.

## PostgreSQL approval boundary

- `commerce` schema: synthetic operational order, payment, inventory, fulfilment, event, and shipment records. The runtime role has `SELECT` only.
- `operations` schema: investigation, evidence, escalation, idempotency, and append-only audit records. The runtime role receives only the workflow permissions it requires.
- The two-schema safety boundary is fixed by the final plan. The detailed entities, columns, statuses, invariants, permissions, and indexes in `docs/database/schema-proposal.md` were accepted on 2026-07-30 and amended by the final Phase 3 scenario contract.
- `docs/database/client-review-summary.md` records the accepted client decisions.
- `docs/database/schema-proposal.md` is the approved and amended source of truth for schema and database implementation.
- Any later deviation from the accepted schema must be documented and reviewed before migration changes.
- `DATABASE_URL` is reserved for schema-owner migration and explicit verification work.
- `DEMO_DATABASE_URL` authenticates as `commerce_demo` for explicit non-production commerce seed/reset only.
- `WORKFLOW_DATABASE_URL` authenticates as `commerce_workflow`; it has commerce `SELECT`, scoped operations `SELECT`/`INSERT`, and column-level investigation outcome updates only.
- Phase 4 PostgreSQL triggers enforce terminal investigation/evidence consistency, evidence immutability, append-only audit events, escalation derivation, and polymorphic idempotency resource validity.

## Phase 1 approved schema

The following was accepted on 2026-07-30:

- `commerce` owns orders, order items, current payments, warehouses, inventory levels, current fulfilments, fulfilment events, and current shipments.
- `operations` owns investigations, immutable evidence snapshots, human-review escalations, idempotency records, and append-only audit events.
- Each order has at most one current payment, fulfilment, and shipment; absent rows remain representable as evidence.
- Terminal investigations require exactly one immutable evidence snapshot.
- Human-readable identifiers use PostgreSQL `text` and later Prisma `String` fields.
- Native PostgreSQL enums represent the scoped states.
- An investigation has at most one human-review escalation; retries reuse it and reopening a closed case is out of scope.
- Human-review cases are allowed only for outcomes requiring human action, including missing/conflicting evidence, and not merely for `WITHIN_EXPECTED_PROCESSING_TIME`.
- Cross-schema foreign keys are permitted because `commerce` and `operations` share one PostgreSQL database.
- Migration, seed/reset, and workflow-runtime roles are separate; a separate reviewer interface/role is optional and must not broaden scope.
- Evidence uses an immutable versioned JSONB snapshot with relational searchable outcome and trace fields.
- Idempotency is unique by `(tool_name, idempotency_key)` and a reused key with a different request hash conflicts.
- Runtime roles have `SELECT` only on `commerce`; evidence/idempotency/audit records are insert-only after creation.

Approved investigation statuses are `RUNNING`, `COMPLETED`, `NEEDS_MORE_INFO`, and `FAILED`. Evidence statuses are `COMPLETE`, `MISSING`, and `CONFLICTING`. Human-review statuses are `AWAITING_REVIEW`, `IN_REVIEW`, and `CLOSED`. Diagnosis codes remain separate from all lifecycle statuses.

Core approved invariants:

- `COMPLETED` requires `COMPLETE` evidence, a diagnosis, confidence, matched rule, terminal timestamp, and an evidence row.
- `NEEDS_MORE_INFO` requires explicit missing fields or conflicts and forbids a diagnosis.
- Evidence snapshots are immutable and audit events are append-only.
- Escalations are derived from stored investigations; the LLM cannot supply diagnosis/evidence.
- Foreign keys and composite keys prevent cross-order source relationships.
- Runtime grants and later integration tests must prove every commerce mutation fails.

Phase 3 approved one schema amendment: inventory observations are keyed by `(warehouse_id, sku, source_system)` rather than only `(warehouse_id, sku)`. This preserves separate `WAREHOUSE_SYSTEM` and `COMMERCE_SYSTEM` observations for `ORD-1050`. Absence remains distinct from a persisted zero quantity.

## Approved synthetic scenarios

The nine-case matrix in `docs/scenarios/approved-synthetic-scenarios.md` was approved on 2026-07-30 and is frozen:

- `ORD-1042`: assigned warehouse out of stock; escalate to `FULFILMENT_OPERATIONS`.
- `ORD-1043`: fulfilment creation failed; escalate to `FULFILMENT_OPERATIONS`.
- `ORD-1044`: within expected processing time; no escalation by default.
- `ORD-1045`: shipment-label creation failed; escalate to `SHIPPING_OPERATIONS`.
- `ORD-1046`: missing inventory evidence; `NEEDS_MORE_INFO`, no diagnosis, escalate to `OPERATIONS_DATA_REVIEW`.
- `ORD-1047`: shipment already exists; no escalation by default.
- `ORD-1048`: cause not determined; escalate to `GENERAL_COMMERCE_OPERATIONS`.
- `ORD-1049`: payment source reports `PROCESSING`; escalate to `PAYMENT_OPERATIONS`.
- `ORD-1050`: conflicting persisted inventory observations; `NEEDS_MORE_INFO`, no diagnosis, escalate to `OPERATIONS_DATA_REVIEW`.

Every later scenario investigation persists an investigation, evidence snapshot, and audit trail with `commerceStateChanged=false`. Escalations are created only when `shouldEscalate=true`. Scenario changes require explicit client approval.

The demo seed contains commerce evidence only. It never seeds investigations, investigation evidence, escalations, idempotency records, or audit events. Missing evidence is represented by absence, never quantity zero. Conflicting evidence remains stored as separate source observations.

## Stack and repository conventions

Target conventions from the final plan:

- Bun is the only package manager. Repository instructions and scripts must use `bun`, `bunx`, and Turbo; do not introduce npm, pnpm, or yarn commands.
- Turborepo
- TypeScript strict mode and ESM
- No `src/` directories
- Node.js and Express API
- Node.js 20.9.0 or newer, matching the Next.js 16 runtime requirement
- PostgreSQL and Prisma in `packages/db`, following the accepted `commerce` / `operations` schema boundary
- Zod schemas in `packages/schemas` validate every untrusted/external input and shared protocol contract
- A small Tailwind trace viewer in `apps/web`, built after core MCP correctness
- No speculative Redis, queues, Kafka, RAG, multi-agent orchestration, event sourcing, or complex production authentication

Phase 2 reused the existing Bun/Turborepo and Prisma foundation. Phase 3 implemented the approved two-schema Prisma model, typed scenario contracts, validated fixtures, and explicit non-production seed/reset commands. Phase 4 added live role separation, reviewed grants, and database-enforced cross-table invariants. Phase 5 adds only a read-only commerce repository facade over the restricted workflow connection. The API remains disconnected from PostgreSQL, and `apps/docs` remains intentionally absent.

## Package graph and ownership

The planned dependency direction is:

- Applications may depend on packages; packages never depend on applications.
- `apps/api` owns HTTP, health, MCP transport, and read-only trace routes; it is Node.js and Express.
- `apps/web` consumes read-only trace APIs and has no direct database access.
- `packages/mcp` adapts approved tool contracts to `packages/workflow`.
- `packages/workflow` orchestrates evidence, readiness, diagnosis, persistence, idempotency, escalation, and audit behavior.
- `packages/evidence` collects and normalizes source records through repository contracts exported by `packages/db`; it does not import Prisma.
- `packages/diagnosis` applies deterministic rules to normalized schemas and never imports Prisma.
- `packages/db` owns Prisma, migrations, clients, transaction boundaries, repository contracts, and repository implementations. Prisma remains private to this package.
- `packages/schemas` owns public Zod and TypeScript contracts and must remain infrastructure-independent.
- `packages/fixtures` owns typed synthetic cases and seed validation.
- `packages/agent` owns host-neutral instructions and LLM evaluation helpers, not business rules.
- `packages/evaluations` owns scenario, guardrail, contract, and model evaluations.
- `packages/observability` owns the internal trace event vocabulary, safe summaries, and trace queries; public Zod trace contracts live in `packages/schemas`.
- `packages/config` owns shared TypeScript, environment, and test configuration.

Concrete public surfaces through Phase 5:

- `@repo/config` exports API parsing plus separate schema-owner, demo, and workflow PostgreSQL URL validation.
- `apps/api/app.ts` exports the composed Express application for startup and smoke testing.
- `GET /health` returns `{"status":"ok"}`.
- `@repo/schemas` exports the approved scenario, fixture, JSON-value, and plain commerce source-record Zod schemas and inferred types.
- `@repo/fixtures` exports the frozen scenario manifest, typed commerce fixtures, fixed-clock helper, pure validation, and explicit seed/reset/verify composition.
- `@repo/db` exports the Phase 3 transactional demo operations plus `CommerceReadRepository`, `CommerceRepositoryContext`, and `createWorkflowRepositoryContext`.
- The commerce facade reads order, items, current payment/fulfilment/shipment, ordered events, inventory observations, and warehouses through `WORKFLOW_DATABASE_URL`; its public types contain no Prisma types.
- Evidence, diagnosis, workflow, MCP, agent, evaluation, and observability packages still export no behavior.

The remaining planned conceptual public surfaces are `EvidenceCollector`, `EvidenceReadinessEvaluator`, `DiagnosisEngine`, `InvestigationWorkflow`, `HumanReviewWorkflow`, workflow-write repositories, trace queries, and the five MCP tool contracts below. Concrete TypeScript signatures for those later surfaces remain deferred to their owning phases and must use types from `packages/schemas`.

Keep public APIs small and export them through package roots. A phase may refine this graph, but it must document and review any changed direction. The complete acyclic graph is in `docs/architecture/package-graph.md`.

## MCP tools

Only these domain capabilities are planned:

- `list_demo_cases`
- `investigate_order_exception`
- `create_human_review_escalation`
- `get_review_case`
- `get_investigation_trace`

Do not expose `run_sql`, generic record or API tools, inventory reservation, fulfilment reassignment, hold release, shipment retry, or shipment creation.

Investigation and escalation tools may persist only `operations` workflow records. Their descriptions and annotations must state their real side effects and must report `commerceStateChanged=false`.

## Commands verified

Phase 0 commands:

- `PATH=/Users/ritikagupta/.bun/bin:/opt/homebrew/bin:/usr/bin:/bin bun --version`
- `PATH=/Users/ritikagupta/.bun/bin:/opt/homebrew/bin:/usr/bin:/bin bunx prettier --check AGENTS.md README.md docs/**/*.md`
- `PATH=/Users/ritikagupta/.bun/bin:/opt/homebrew/bin:/usr/bin:/bin bun run --filter @repo/ui check-types`
- `PATH=/Users/ritikagupta/.bun/bin:/opt/homebrew/bin:/usr/bin:/bin bun run --filter @repo/ui build:components`
- `PATH=/Users/ritikagupta/.bun/bin:/opt/homebrew/bin:/usr/bin:/bin bun run check-types`
- `PATH=/Users/ritikagupta/.bun/bin:/opt/homebrew/bin:/usr/bin:/bin bun run --filter @repo/ui lint`
- `PATH=/Users/ritikagupta/.bun/bin:/opt/homebrew/bin:/usr/bin:/bin bun run lint`
- `/usr/bin/git diff --check`

The first Phase 0 root typecheck failed because the starter's `@repo/ui` export
map targeted generated `dist` files. During Phase 3 review, all internal
workspace packages were changed to source-first exports, so consumers now
resolve package-root TypeScript directly. Package builds may still emit
artifacts for verification, but those artifacts are not workspace entry
points. `apps/api` uses Bun's bundler with `--target node`, and the produced
`dist/server.js` remains a Node.js runtime artifact.

The expected and actual results are recorded in `docs/evaluations/phase-00.md`. No test, migrate, seed, reset, development, or evaluation-harness command was required or claimed for this documentation-only phase.

Phase 1 commands:

- `PATH=/Users/ritikagupta/.bun/bin:/opt/homebrew/bin:/usr/bin:/bin bun -e '<schema-document consistency assertions>'`
- `PATH=/Users/ritikagupta/.bun/bin:/opt/homebrew/bin:/usr/bin:/bin bun -e '<client-summary consistency assertions>'`
- `PATH=/Users/ritikagupta/.bun/bin:/opt/homebrew/bin:/usr/bin:/bin bunx prettier --check AGENTS.md README.md docs/**/*.md`
- `/usr/bin/git diff --check`
- `/usr/bin/git diff -- packages/db`
- Prisma migration-directory absence check
- Mermaid CLI availability check followed by manual ER syntax review

Expected and actual results are recorded in `docs/evaluations/phase-01.md`. No Prisma validation, generation, migration, or database command was run during Phase 1; schema implementation remains assigned to Phase 4.

Phase 2 commands:

- `bun install`
- `bun run --filter @repo/config typecheck`
- `bun run --filter @repo/api typecheck`
- `bun run --filter @repo/config test`
- `bun run --filter @repo/api test`
- `bun run build`
- `bun run typecheck`
- `bun run test`
- `bun run lint`
- `PORT=43120 NODE_ENV=test node apps/api/dist/server.js` followed by `curl -i http://127.0.0.1:43120/health`
- Browser verification of the production web shell at `http://127.0.0.1:43121`
- Package-name, dependency-direction, cycle, no-`src/`, schema-diff, migration-absence, ignored-file, and whitespace checks

The final package and Turbo checks passed. The API smoke test passed with one focused test, and the compiled API returned HTTP 200 with `{"status":"ok"}`. Local TCP listeners and the Next.js build worker required execution outside the managed sandbox because loopback binding and worker creation were restricted there; the application checks themselves passed. Full expected and actual results, including the failed diagnostic attempts, are recorded in `docs/evaluations/phase-02.md`.

Phase 3 commands:

- `bun install`
- `bun run db:generate`
- `bun --bun run prisma format`
- `bun --bun run prisma validate`
- `bun run db:migrate`
- `bun run db:seed`
- `bun run db:reset-demo`
- `bun run db:verify-demo`
- `bun run --filter @repo/fixtures test:integration`
- `bun run build`
- `bun run typecheck`
- `bun run test`
- `bun run lint`
- Formatting, dependency-direction, no-`src/`, secret/artifact, forbidden-capability, schema-drift, migration-status, and whitespace checks

The database commands use the explicitly configured development/schema-owner credential. Runtime credentials are not implemented or used. Expected versus actual results and the final row counts are recorded in `docs/evaluations/phase-03-synthetic-scenarios.md`.

Final Phase 3 results: build 14/14 Turbo tasks, typecheck 14/14, test 17/17 Turbo tasks (fixtures 30/30, config 4/4, API 1/1), and lint 2/2. PostgreSQL read-back returned 9 orders, 9 items, 9 payments, 2 warehouses, 8 inventory observations, 7 fulfilments, 14 events, and 1 shipment; every workflow-table count was zero.

The source-first export review correction was rechecked with install, build
(14/14), typecheck (14/14), lint (2/2), a Node-built API health request (HTTP
200), and read-only database verification. The root test rerun passed the API,
config, and 29 non-database fixture tests, but the remote PostgreSQL integration
test then received Prisma `P2028` because the interactive transaction exceeded
its five-second timeout. The same integration test passed before this
package-manifest-only correction, and the database remained readable with the
approved counts; a clean transaction-capable rerun is still required.

Phase 4 resolved that handoff: the unchanged Phase 3 integration test first
passed cleanly in 21.2 seconds. After moving seed/reset to `commerce_demo`, the
hosted connection required a demo-only 15-second acquisition window, a
30-second transaction timeout, and a 90-second integration-test ceiling. The
test then passed in 33.8 seconds without changing the fixture transaction
design.

Phase 4 commands:

- `bun install --frozen-lockfile`
- `bun run db:generate`
- `bun --bun run prisma validate`
- `bun run db:migrate`
- `bun run db:setup-access:local`
- `bun run db:setup-access`
- `bun run db:verify-access`
- `bun run --filter @repo/fixtures test:integration`
- `bun run --filter @repo/db test`
- `bun run db:verify-demo`
- `bun run build`
- `bun run typecheck`
- `bun run test`
- `bun run lint`
- Prisma migration-status, restricted-role, unchanged-data, formatting, and whitespace checks

Final Phase 4 application checks: build 14/14, typecheck 14/14, root test
18/18 Turbo tasks, lint 2/2, config 10/10, database hardening 6/6, fixtures
30/30, and API 1/1. The live Neon database accepted both restricted roles and
all required permission/invariant checks.

Phase 5 commands:

- `bun install --frozen-lockfile`
- `bun run db:verify-demo`
- `bun run db:verify-access`
- `bun test tests/commerce-repository.test.ts` from `packages/db`
- `bun run --filter @repo/db test`
- `bun run build`
- `bun run typecheck`
- `bun run test`
- `bun run lint`
- Representative restricted-role reads, public declaration inspection,
  formatting, scope, secret, and whitespace checks

Final Phase 5 checks: build 14/14, typecheck 14/14, root test 18/18 Turbo
tasks, lint 2/2, config 10/10, database 7/7 with 104 assertions, fixtures
30/30, and API 1/1. The focused repository integration test passed 1/1 with 36
assertions. Final demo verification retained every approved commerce count and
zero operations rows.

## Phase status

| Phase | Status          | Evaluation report                                             | Notes                              |
| ----- | --------------- | ------------------------------------------------------------- | ---------------------------------- |
| 0     | Complete        | `docs/evaluations/phase-00.md`                                | Accepted 2026-07-30                |
| 1     | Complete        | `docs/evaluations/phase-01.md`                                | Accepted 2026-07-30                |
| 2     | Complete        | `docs/evaluations/phase-02.md`                                | Accepted 2026-07-30                |
| 3     | Complete        | `docs/evaluations/phase-03-synthetic-scenarios.md`            | Accepted and merged 2026-07-30     |
| 4     | Complete        | `docs/evaluations/phase-04-database-hardening.md`             | Accepted and merged 2026-07-30     |
| 5     | Awaiting review | `docs/evaluations/phase-05-readonly-commerce-repositories.md` | Commerce read boundary implemented |
| 6     | Not started     | Not created                                                   | Blocked by phase sequence          |
| 7     | Not started     | Not created                                                   | Blocked by phase sequence          |
| 8     | Not started     | Not created                                                   | Blocked by phase sequence          |
| 9     | Not started     | Not created                                                   | Blocked by phase sequence          |
| 10    | Not started     | Not created                                                   | Blocked by phase sequence          |
| 11    | Not started     | Not created                                                   | Blocked by phase sequence          |
| 12    | Not started     | Not created                                                   | Blocked by phase sequence          |
| 13    | Not started     | Not created                                                   | Blocked by phase sequence          |

## Decisions and trade-offs

- 2026-07-30: Store the supplied final plan in the repository as the plan of record.
- 2026-07-30: Treat this documentation intake as preparation, not Phase 0 completion.
- 2026-07-30: Preserve the existing starter code until an approved phase explicitly changes it.
- 2026-07-30: Record the two-schema safety boundary now, while deferring detailed schema approval to Phase 1.
- 2026-07-30: Deterministic TypeScript owns evidence readiness and diagnosis; the LLM is limited to tool selection and explanation.
- 2026-07-30: Repository contracts live at the `packages/db` boundary and Prisma stays private there, avoiding a `db`/`evidence` dependency cycle.
- 2026-07-30: Public package surfaces are named conceptually in Phase 0; concrete signatures wait for the schema and contract phases that own them.
- 2026-07-30: Reject generic SQL/API tools, commerce mutation capabilities, and speculative production infrastructure.
- 2026-07-30: Phase 0 workflow contract and package graph accepted by the reviewer.
- 2026-07-30: `apps/docs` is not required and was removed by the user.
- 2026-07-30: Preserve the user-initialized `packages/db` Prisma skeleton through Phases 0 and 1; reconcile its schema and generated-client setup only in the phase that owns that implementation.
- 2026-07-30: Approve zero-or-one current payment, fulfilment, and shipment per order; detailed histories are deferred and absent rows remain distinct from source-read failures.
- 2026-07-30: Approve human-readable PostgreSQL `text` identifiers (Prisma `String`), native PostgreSQL enums, versioned immutable JSONB evidence, and relational searchable outcomes.
- 2026-07-30: Approve one human-review case per investigation; retries reuse it and reopening a closed case is out of scope.
- 2026-07-30: Permit cases only for outcomes requiring human action, including missing/conflicting evidence; `WITHIN_EXPECTED_PROCESSING_TIME` alone is not escalation-eligible.
- 2026-07-30: Approve cross-schema foreign keys because both schemas share one PostgreSQL database.
- 2026-07-30: Approve separate schema-owner/migration, demo seed/reset, and workflow-runtime roles; a separate reviewer interface/role remains optional.
- 2026-07-30: Accept `docs/database/schema-proposal.md` as the database implementation source of truth.
- 2026-07-30: Reject schema additions for histories, multi-tenancy, event sourcing, partitioning, archival, or external synchronization without a scoped need.
- 2026-07-30: Reuse the initialized Bun/Turborepo workspace and `packages/db` Prisma setup instead of reinitializing either foundation.
- 2026-07-30: Standardize application and product-package names under the existing `@repo/*` scope; keep package roots intentionally empty until their owning phases.
- 2026-07-30: Move `packages/ui` source files from `src/` to `components/` and the package root to satisfy the no-`src/` convention without deleting the starter package.
- 2026-07-30: Use the Node built-in test runner with the `tsx` loader for the Express smoke test because Bun's Node HTTP compatibility path could not bind an ephemeral port in this environment.
- 2026-07-30: Make Next.js run TypeScript validation during builds and set the Turbopack root explicitly to the repository root; do not suppress build type errors.
- 2026-07-30: Require Node.js 20.9.0 or newer because the retained Next.js 16 workspace requires that minimum runtime.
- 2026-07-30: Keep Phase 2 free of Prisma models, migrations, repositories, domain contracts, MCP tools, AI behavior, and speculative infrastructure.
- 2026-07-30: Reject reinitializing the repository, replacing the existing web framework, adding a second package manager, or introducing domain behavior before its phase gate.
- 2026-07-30: Treat the committed Phase 2 foundation as accepted when the client supplied the final Phase 3 prompt and approved scenario matrix.
- 2026-07-30: The latest Phase 3 prompt supersedes the original phase split by moving the minimum accepted Prisma schema, migration, and seed/reset implementation from Phase 4 into Phase 3.
- 2026-07-30: Amend inventory identity to `(warehouse_id, sku, source_system)` so `ORD-1050` stores two independently sourced, conflicting quantities instead of constructing a conflict in memory.
- 2026-07-30: Keep the historical PostgreSQL table name `commerce.inventory_levels`, while its rows and TypeScript contract represent source-specific inventory observations.
- 2026-07-30: Use a fixed fixture clock (`2026-07-30T12:00:00.000Z`) and a four-hour processing window; never derive fixture behavior from `Date.now()`.
- 2026-07-30: Use explicit schema-owner/development credentials for migration and non-production seed/reset only. Dedicated seed/reset and runtime roles remain a later hardening gate.
- 2026-07-30: Keep Prisma private to `packages/db`; `packages/fixtures` composes public transactional demo-data operations after Zod and relationship validation.
- 2026-07-30: Reject seeding workflow records, automatic startup reset, in-memory-only conflicts, diagnosis rules, MCP tools, LLM behavior, operational fixes, and any commerce mutation outside explicit demo seed/reset.
- 2026-07-30: Use source-first TypeScript exports for internal Bun workspace packages. Keep the Express production artifact Node-compatible by bundling `apps/api/server.ts` with Bun's Node target before running it with Node.js.
- 2026-07-30: Accept merged Phase 3 as the database-hardening baseline and keep the Phase 3 migration immutable.
- 2026-07-30: Reserve `DATABASE_URL` for the schema owner, `DEMO_DATABASE_URL` for `commerce_demo`, and `WORKFLOW_DATABASE_URL` for `commerce_workflow`; credentials remain local and ignored.
- 2026-07-30: Provision roles/grants only through the explicit owner command. Existing Neon roles are verified and reused because the provider permits creation but denies later password rotation through this owner connection.
- 2026-07-30: Enforce terminal evidence, escalation, idempotency, evidence immutability, and audit append-only rules in PostgreSQL with deferred constraint triggers where same-transaction creation requires them.
- 2026-07-30: Keep private validation functions non-executable by restricted roles; narrowly scoped trigger wrappers run as their migration owner.
- 2026-07-30: Serialize dependency-package tests with Turbo `^test` so database invariant tests complete before fixture reset tests.
- 2026-07-30: Accept and merge Phase 4 as commit `97fcf99`; Phase 5 starts from that clean database-hardening baseline.
- 2026-07-30: Follow the final Phase 5 prompt's narrower boundary: implement commerce reads only and defer operations/workflow repositories.
- 2026-07-30: Expose one `CommerceReadRepository` facade and one cleanup context backed exclusively by `WORKFLOW_DATABASE_URL`; Prisma remains an internal implementation detail.
- 2026-07-30: Return validated plain records with ISO timestamps, decimal strings, JSON-safe event details, source-native statuses, explicit nulls/empty arrays, and PostgreSQL-native deterministic enum ordering.

## Known limitations

- `apps/api` exposes only the health endpoint; MCP transport, trace routes, workflow composition, and database access are intentionally absent.
- `apps/web` is a static non-functional trace-viewer shell and has no API or database integration.
- `packages/evidence`, `diagnosis`, `workflow`, `mcp`, `agent`, `evaluations`, and `observability` remain empty package roots.
- Phase 5 exposes source reads only. Evidence aggregation, normalization, readiness, conflict classification, diagnosis, and all operations-table repositories remain deferred.
- The workflow Prisma client is constructed only inside `packages/db` from `WORKFLOW_DATABASE_URL`; the API does not import the repository factory or load any database URL.
- Neon does not allow the configured schema owner to rotate the passwords of existing child roles. Idempotent access setup therefore reapplies grants and verifies existing credentials instead of altering existing roles.
- `db:seed` expects an empty migrated demo data set; use the explicit `db:reset-demo` helper for repeatable restoration.
- Demo reset is intentionally commerce-only and will fail rather than delete persisted workflow evidence that references an approved order.
- Diagnosis expectations in the manifest are acceptance data only. No diagnosis engine evaluates them yet.
- Local development requires Bun 1.3.2 and Node.js 20.9.0 or newer.
- Local TCP smoke tests and the Next.js production build require an environment that permits loopback listeners and worker creation.
- Full copy-paste prompts for Phases 0-13 are not stored here. The repository currently stores the final plan and the prompt-use protocol only.
- A separate human-reviewer role remains out of scope; `commerce_workflow` cannot update review cases.

## Instructions for coding agents

- Read this file, the root `README.md`, the final plan, and `docs/plans/how-to-use-phase-prompts.md` before editing.
- Inspect the repository and current working tree before making changes.
- Implement only the explicitly requested phase.
- Do not continue automatically to the next phase.
- Do not silently change permanent decisions, safety boundaries, the accepted schema, or dependency direction.
- The Phase 1 schema is accepted. Any later deviation must be documented and reviewed before migration changes.
- Run every reported command, inspect its key output, and report expected versus actual results honestly.
- Before stopping a phase, update this file, the README phase table, and `docs/evaluations/phase-XX.md`.
- In every phase handoff, list every file updated during that phase, grouped by app/package/documentation area.
- Never claim a command, guardrail, workflow, deployment, or operational action was verified unless it was actually exercised.
