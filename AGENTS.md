# AGENTS.md

## Product goal

Diagnose why a paid order has not reached shipment creation and create a persistent human-review escalation.

## Current gate

- Phase 0 was reviewed and accepted on 2026-07-30.
- Phase 1 was reviewed and accepted on 2026-07-30.
- The next permitted implementation phase is Phase 2, in a separate coding session using only the Phase 2 prompt.
- Phase 3 and later phases remain blocked by the phase sequence.
- Use one phase prompt in one coding session and stop at its review gate.
- Do not start Phase 2 without its explicit prompt, and do not implement work from later phases during Phase 2.
- The existing Prisma skeleton in `packages/db` remains unchanged and model-free; schema implementation belongs to Phase 4.

## Permanent safety boundary

- Operational commerce state is read-only.
- Allowed writes are limited to the operations workflow: investigations, immutable evidence snapshots, human-review escalations, idempotency records, and append-only audit events.
- Forbidden: order, payment, inventory, fulfilment, event, or shipment mutation; raw SQL tools; unrestricted API tools; or claims that an operational fix was executed.
- A recommendation is a proposal for human review, never evidence that an operational action occurred.
- Observable audit activity may be stored. Hidden model chain of thought must not be stored.

## PostgreSQL approval boundary

- `commerce` schema: synthetic operational order, payment, inventory, fulfilment, event, and shipment records. The runtime role has `SELECT` only.
- `operations` schema: investigation, evidence, escalation, idempotency, and append-only audit records. The runtime role receives only the workflow permissions it requires.
- The two-schema safety boundary is fixed by the final plan. The detailed entities, columns, statuses, invariants, permissions, and indexes in `docs/database/schema-proposal.md` were accepted on 2026-07-30.
- `docs/database/client-review-summary.md` records the accepted client decisions.
- `docs/database/schema-proposal.md` is the approved source of truth for later schema and database implementation.
- Any later deviation from the accepted schema must be documented and reviewed before migration changes.

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

## Stack and repository conventions

Target conventions from the final plan:

- Bun is the only package manager. Repository instructions and scripts must use `bun`, `bunx`, and Turbo; do not introduce npm, pnpm, or yarn commands.
- Turborepo
- TypeScript strict mode and ESM
- No `src/` directories
- Node.js and Express API
- PostgreSQL and Prisma in `packages/db`, following the accepted `commerce` / `operations` schema boundary
- Zod schemas in `packages/schemas` validate every untrusted/external input and shared protocol contract
- A small Tailwind trace viewer in `apps/web`, built after core MCP correctness
- No speculative Redis, queues, Kafka, RAG, multi-agent orchestration, event sourcing, or complex production authentication

The current repository contains the remaining `apps/web` starter and a user-initialized Prisma skeleton in `packages/db`. `apps/docs` was removed because it is not part of the product. Existing scaffold choices are not automatically approved; reconcile them only in the appropriate accepted phase.

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

The planned conceptual public surfaces are `EvidenceCollector`, `EvidenceReadinessEvaluator`, `DiagnosisEngine`, `InvestigationWorkflow`, `HumanReviewWorkflow`, repository contracts, trace queries, and the five MCP tool contracts below. Concrete TypeScript signatures are intentionally deferred to their owning phases and must use types from `packages/schemas`.

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

The first root typecheck failed because the starter's `@repo/ui` export map targets generated `dist` files. The package-level component build generated those files, after which the root typecheck passed. This prerequisite is not yet encoded in Turbo.

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

## Phase status

| Phase | Status      | Evaluation report              | Notes                     |
| ----- | ----------- | ------------------------------ | ------------------------- |
| 0     | Complete    | `docs/evaluations/phase-00.md` | Accepted 2026-07-30       |
| 1     | Complete    | `docs/evaluations/phase-01.md` | Accepted 2026-07-30       |
| 2     | Not started | Not created                    | Next permitted phase      |
| 3     | Not started | Not created                    | Blocked by phase sequence |
| 4     | Not started | Not created                    | Blocked by phase sequence |
| 5     | Not started | Not created                    | Blocked by phase sequence |
| 6     | Not started | Not created                    | Blocked by phase sequence |
| 7     | Not started | Not created                    | Blocked by phase sequence |
| 8     | Not started | Not created                    | Blocked by phase sequence |
| 9     | Not started | Not created                    | Blocked by phase sequence |
| 10    | Not started | Not created                    | Blocked by phase sequence |
| 11    | Not started | Not created                    | Blocked by phase sequence |
| 12    | Not started | Not created                    | Blocked by phase sequence |
| 13    | Not started | Not created                    | Blocked by phase sequence |

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

## Known limitations

- The repository still contains starter application/package code that has not been evaluated against the final plan.
- `packages/ui/src/` conflicts with the target no-`src/` convention; it has deliberately not been changed during plan intake.
- `apps/api` and most target domain packages do not exist; Phase 2 must reconcile the starter only after schema acceptance.
- `packages/db` is initialized with Prisma 7.9.1, but its Prisma schema has no models or migrations and its scaffold API has not been reviewed against the approved package boundary.
- The current root scripts do not yet expose the full planned command set.
- The starter root typecheck is not clean-clone standalone: `@repo/ui` must run `build:components` first because its export map resolves generated `dist` files and Turbo does not encode that dependency.
- Full copy-paste prompts for Phases 0-13 are not stored here. The repository currently stores the final plan and the prompt-use protocol only.
- The safety boundary and package graph are documentation contracts only; no database permission or runtime guardrail exists yet.
- The Phase 1 schema is accepted but none of its entities, enums, triggers, grants, or indexes is implemented yet.
- Cross-table terminal-state and escalation consistency will require reviewed PostgreSQL constraint triggers in Phase 4.

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
