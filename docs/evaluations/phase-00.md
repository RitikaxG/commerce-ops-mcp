# Phase 00 Evaluation Report

## Goal

Freeze the workflow contract and repository rules before application code is written.

## Scope implemented

- Defined the selected operations user and bounded paid-order/no-shipment question.
- Defined required evidence, evidence states, diagnosis codes, success/stop/failure behavior, and the human-review outcome.
- Froze the read-only commerce boundary and the only allowed operations-workflow writes.
- Defined the five planned MCP capabilities without implementing them.
- Defined an acyclic application/package dependency direction and conceptual public surfaces.
- Added the reusable phase evaluation template and updated phase status/gates.

No application, package, database schema, migration, fixture, AI behavior, MCP server, or runtime workflow was implemented.

## Files and packages changed

| File                                     | Change                                                                                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `AGENTS.md`                              | Added Phase 0 status, permanent constraints, package/public-surface decisions, verified commands, decisions, and next-phase prerequisites. |
| `README.md`                              | Added Phase 0 review links, status, and concise verification summary.                                                                      |
| `docs/workflow-contract.md`              | Created the product, evidence, outcome, safety, tool, and phase-review contract.                                                           |
| `docs/architecture/package-graph.md`     | Created the planned dependency graph, ownership table, public surfaces, cycle review, and starter differences.                             |
| `docs/evaluations/README.md`             | Created the reusable evaluation report template and evidence rules.                                                                        |
| `docs/evaluations/phase-00.md`           | Created this evaluation report.                                                                                                            |
| `docs/plans/how-to-use-phase-prompts.md` | Added the `Awaiting review` state and current Phase 0 handoff.                                                                             |

No app or package implementation file changed.

## Automated checks

| Command                                                  | Expected                                                            | Actual                                                                                                                                | Result |
| -------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `bun --version`                                          | Bun matches the repository's declared version.                      | `1.3.2`.                                                                                                                              | Pass   |
| `bunx prettier --check AGENTS.md README.md docs/**/*.md` | All Phase 0 Markdown uses repository formatting.                    | `All matched files use Prettier code style!`                                                                                          | Pass   |
| `bun run --filter @repo/ui check-types`                  | The package-level prerequisite check passes.                        | `@repo/ui check-types: Exited with code 0`.                                                                                           | Pass   |
| Initial `bun run check-types`                            | Existing Turbo typecheck tasks complete successfully.               | Failed: `docs`/`web` could not resolve `@repo/ui/card`, `gradient`, or `turborepo-logo` because generated `dist` exports were absent. | Fail   |
| `bun run --filter @repo/ui build:components`             | Generate the starter UI exports required by its package export map. | `@repo/ui build:components: Exited with code 0`.                                                                                      | Pass   |
| `bun run check-types` after the UI build                 | Existing Turbo typecheck tasks complete successfully.               | `3 successful, 3 total`; exit code 0.                                                                                                 | Pass   |
| `bun run --filter @repo/ui lint`                         | The package-level lint check passes before the workspace check.     | `@repo/ui lint: Exited with code 0`.                                                                                                  | Pass   |
| `bun run lint`                                           | Existing Turbo lint tasks complete successfully.                    | `3 successful, 3 total`; exit code 0.                                                                                                 | Pass   |
| `git diff --check`                                       | No whitespace errors in tracked changes.                            | No output; exit code 0.                                                                                                               | Pass   |

The current repository has no root `test` script. Phase 0 did not introduce one because it changes documentation only.

All successful Bun commands used:

```sh
PATH=/Users/ritikagupta/.bun/bin:/opt/homebrew/bin:/usr/bin:/bin
```

The desktop shell initially returned `command not found` for unprefixed `bun`/`bunx`. A preliminary `bun --filter @repo/ui run ...` invocation also returned `No packages matched the filter`; the correct Bun syntax, `bun run --filter @repo/ui ...`, was then used. These invocation failures are recorded here and were not treated as product-check results.

The initial root typecheck failure is a real starter limitation. It was not hidden or fixed through out-of-scope tooling edits; the successful rerun used the existing package's build command.

## Manual verification

### Safety review

Reviewed all five planned MCP capabilities in `docs/workflow-contract.md`:

- `list_demo_cases`, `get_review_case`, and `get_investigation_trace` write nothing.
- `investigate_order_exception` writes only investigation, immutable snapshot, idempotency, and audit records in `operations`.
- `create_human_review_escalation` writes only escalation, idempotency, and audit records in `operations`.
- Every tool forbids commerce writes, and workflow responses state `commerceStateChanged=false`.

### Dependency review

Walked the proposed graph in topological order:

1. `config`, `schemas`
2. `db`, `diagnosis`, `agent`
3. `fixtures`, `evidence`, `observability`
4. `workflow`
5. `mcp`
6. `apps/api`
7. HTTP-only `apps/web` and top-level `evaluations`

No back-edge or circular import is proposed. Repository contracts remain in `db`; `evidence` consumes those contracts without Prisma, and `db` does not import `evidence`.

### Documentation review

- Success is explicitly `COMPLETE` evidence plus deterministic diagnosis and a persisted `COMPLETED` investigation.
- The uncertainty stop is explicitly `MISSING`/`CONFLICTING` evidence mapped to `NEEDS_MORE_INFO`, with no diagnosis or guessed fix.
- Unexpected technical errors map to `FAILED`, not a business diagnosis.
- Human escalation is persistent, derived from stored investigation data, and never represents an executed operational action.

### Scope review

`git status --short` showed only README/AGENTS/documentation changes after temporary PDF-review files were removed. No app, package, schema, migration, fixture, or runtime file was edited.

## Guardrails verified

- Commerce state is read-only in every documented layer and tool.
- Allowed writes are limited to investigations, immutable evidence snapshots, human-review escalations, idempotency records, and append-only audit events.
- No raw SQL, generic API, reservation, reassignment, hold release, fulfilment retry, or shipment mutation capability is planned.
- Missing/conflicting evidence cannot fall through to `CAUSE_NOT_DETERMINED`.
- Deterministic TypeScript owns evidence readiness and diagnosis; the LLM is limited to tool selection and explanation.
- Observable trace data excludes hidden chain of thought.
- Phase 1 remains blocked until Phase 0 acceptance; Phase 2 and all implementation remain blocked until schema acceptance.
- No speculative infrastructure was added.

## Sample output / IDs / trace evidence

No runtime IDs, MCP results, database rows, or traces exist in Phase 0.

The contract uses planned examples such as `ORD-1042` and `NEEDS_MORE_INFO` only to define later behavior; it does not claim those fixtures are implemented.

## Known limitations

- The detailed PostgreSQL schema is not approved; that is the Phase 1 client-review deliverable.
- Safety is documented but not enforced by runtime roles, repositories, or tests yet.
- Target apps and domain packages do not exist.
- The starter's `packages/ui/src/` layout conflicts with the target no-`src/` convention.
- `apps/docs` was removed by the user after review because it has no target responsibility.
- Concrete Zod and TypeScript interfaces are deferred to later phases.
- The existing Turbo typecheck requires `@repo/ui` component output to be built first; the pipeline does not declare this prerequisite.
- Bun is installed at `/Users/ritikagupta/.bun/bin` but was not present on the desktop execution shell's initial `PATH`.
- A Prisma 7.9.1 skeleton now exists in `packages/db`; its schema is empty and remains outside Phase 0 approval.

## Decisions changed during review

No permanent decision from the final plan changed.

Phase 0 clarified that repository contracts belong at the `packages/db` boundary while Prisma remains private, preventing a planned `db`/`evidence` cycle.

During reviewer acceptance:

- Phase 0 was explicitly accepted on 2026-07-30.
- The reviewer confirmed that `apps/docs` is not needed and removed it.
- The reviewer initialized Prisma in `packages/db`; this does not approve a schema or authorize migrations.
- Future phase handoffs must list every updated file.

## Exit decision

**Accepted**

The reviewer accepted the written workflow contract, package graph, phase process, and evaluation evidence on 2026-07-30.
