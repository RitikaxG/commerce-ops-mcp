# AI-First Commerce Operations Investigator

This repository will implement a bounded operations workflow that explains why a paid order has not reached shipment creation and can create a persistent human-review escalation.

## Current state

Phases 0 through 8 are complete. Phase 9 has implemented and verified the
persistent investigation and explicit human-review escalation workflow on
`phase/09-persistence-escalation`; it is awaiting review.

The existing Bun/Turborepo and Prisma setup was reused rather than reinitialized. PostgreSQL contains the validated nine-order commerce seed. Separate owner, demo, and workflow roles enforce the database boundary. The Phase 9 workflow composes evidence collection, readiness, deterministic diagnosis, atomic operations persistence, exact idempotency, safe audit events, explicit escalation, and read-only case/trace queries. AI behavior, MCP, HTTP workflow routes, and the trace viewer remain unimplemented.

Local prerequisites are Bun 1.3.2 and Node.js 20.9.0 or newer.

## Plan and working instructions

- [Final plan](docs/plans/Diligence_AI_Commerce_Operations_Final_Plan_Updated.pdf)
- [Workflow contract](docs/workflow-contract.md)
- [Package graph](docs/architecture/package-graph.md)
- [Approved PostgreSQL schema](docs/database/schema-proposal.md)
- [Schema acceptance summary](docs/database/client-review-summary.md)
- [Approved synthetic scenarios](docs/scenarios/approved-synthetic-scenarios.md)
- [How to use the phase prompts](docs/plans/how-to-use-phase-prompts.md)
- [Coding-agent instructions](AGENTS.md)

The final Phase 3 prompt moved the minimum Prisma schema, migration, and seed/reset work forward from the original Phase 4 plan. `ORD-1050` also required one approved amendment: source-specific inventory observations are persisted separately.

## Implementation status

| Phase | Status          | Main output                                                    | Evaluation                                                            |
| ----- | --------------- | -------------------------------------------------------------- | --------------------------------------------------------------------- |
| 0     | Complete        | Workflow contract and repository rules                         | [Report](docs/evaluations/phase-00.md)                                |
| 1     | Complete        | [Approved PostgreSQL schema](docs/database/schema-proposal.md) | [Report](docs/evaluations/phase-01.md)                                |
| 2     | Complete        | Bun and Turborepo foundation                                   | [Report](docs/evaluations/phase-02.md)                                |
| 3     | Complete        | Approved scenarios, validation, PostgreSQL seed/reset          | [Report](docs/evaluations/phase-03-synthetic-scenarios.md)            |
| 4     | Complete        | Roles, grants, immutable records, cross-table invariants       | [Report](docs/evaluations/phase-04-database-hardening.md)             |
| 5     | Complete        | Repositories and read-only commerce boundary                   | [Report](docs/evaluations/phase-05-readonly-commerce-repositories.md) |
| 6     | Complete        | Evidence collection and normalization                          | [Report](docs/evaluations/phase-06-evidence-collector.md)             |
| 7     | Complete        | Evidence readiness and conflict gate                           | [Report](docs/evaluations/phase-07-evidence-readiness.md)             |
| 8     | Complete        | Deterministic diagnosis and suggested action                   | [Report](docs/evaluations/phase-08-diagnosis-engine.md)               |
| 9     | Awaiting review | Persistent investigation and escalation workflow               | [Report](docs/evaluations/phase-09-persistence-escalation.md)         |
| 10    | Not started     | Standard remote MCP server                                     | Not created                                                           |
| 11    | Not started     | Agent behavior and LLM evaluations                             | Not created                                                           |
| 12    | Not started     | Trace APIs and minimal Tailwind viewer                         | Not created                                                           |
| 13    | Not started     | Hardening, deployment, and submission evidence                 | Not created                                                           |

## Verified commands

Phase 0 verified the current workspace with:

- `bunx prettier --check AGENTS.md README.md docs/**/*.md`
- `bun run --filter @repo/ui check-types`
- `bun run --filter @repo/ui build:components`
- `bun run check-types`
- `bun run --filter @repo/ui lint`
- `bun run lint`

The desktop shell required `/Users/ritikagupta/.bun/bin` on `PATH`. Phase 0
originally inherited generated `dist` exports from the starter. During Phase 3
review, every internal workspace package was changed to export its TypeScript
source directly. Builds may still emit `dist` artifacts, but workspace imports
do not resolve through them. The Express API is bundled from source with Bun's
Node target and the resulting `dist/server.js` still runs with Node.js.

See the [Phase 0 evaluation report](docs/evaluations/phase-00.md) for expected and actual results. No migrate, seed, reset, development, evaluation-harness, or runtime workflow command exists or was claimed for this documentation-only phase.

Phase 1 checks passed for required schema tokens/ER references, client-summary consistency, Markdown formatting, whitespace, unchanged `packages/db`, and absence of migrations. Mermaid CLI was unavailable, so the ERD received manual syntax review. Full results are in the [Phase 1 evaluation report](docs/evaluations/phase-01.md).

No Prisma model, generation, validation, migration, or database command was run.

Phase 2 verified:

- `bun install`
- `bun run build` — 14 successful Turbo tasks
- `bun run typecheck` — 14 successful Turbo tasks
- `bun run test` — 16 successful Turbo tasks; environment tests 2/2 and API smoke test 1/1 passed
- `bun run lint` — 2 successful Turbo tasks
- Compiled API request — HTTP 200 with `{"status":"ok"}`
- Static web-shell browser check — expected layout with no console warnings/errors

The final build and listener-based tests were run outside the managed sandbox because its worker and loopback restrictions blocked those processes. The application checks passed in the normal local environment. Full commands, diagnostic attempts, guardrails, and actual output are in the [Phase 2 evaluation report](docs/evaluations/phase-02.md).

Phase 3 verified:

- `bun run db:generate`
- Prisma schema format and validation
- `bun run db:migrate`
- `bun run db:seed`
- `bun run db:reset-demo`
- `bun run db:verify-demo`
- Unit, scenario, relationship, startup-guard, and PostgreSQL transaction tests
- Root build, typecheck, test, lint, formatting, and guardrail checks

See the [Phase 3 evaluation report](docs/evaluations/phase-03-synthetic-scenarios.md) for expected and actual results.

Phase 4 completed the previously pending remote transaction rerun through the
dedicated demo role. The approved seed/reset integration test now passes with a
hosted-database-aware timeout configuration and without changing its
transaction design.

Phase 4 verified:

- Live `commerce_demo` and `commerce_workflow` logins and idempotent grants
- Workflow commerce `SELECT` with every commerce mutation rejected
- Scoped operations inserts and investigation lifecycle updates
- Immutable evidence, append-only audit, derived escalations, and valid idempotency resources
- Build 14/14, typecheck 14/14, test 18/18, lint 2/2

Phase 5 adds:

- `CommerceReadRepository` for order, item, payment, fulfilment, event, shipment, inventory, and warehouse reads
- `CommerceRepositoryContext` and `createWorkflowRepositoryContext()` with explicit cleanup
- Plain Zod-validated records with ISO timestamps, decimal strings, JSON-safe details, null singulars, and empty collections
- Deterministic source ordering without evidence aggregation, conflict classification, or diagnosis logic

The repository factory reads only `WORKFLOW_DATABASE_URL`. Prisma remains
private to `packages/db`, and `apps/api` does not import or construct a
repository context.

Phase 5 verification passed:

- Focused restricted-role repository integration: 1 test, 36 assertions
- Full database package: 7 tests, 104 assertions
- Root build 14/14, typecheck 14/14, test 18/18, and lint 2/2 Turbo tasks
- Final demo counts unchanged and all operations tables empty

Phase 6 adds:

- A versioned `NormalizedOrderEvidence` Zod contract with ordered metadata for
  `ORDER`, `ORDER_ITEMS`, `PAYMENT`, `FULFILMENT`, `FULFILMENT_EVENTS`,
  `SHIPMENT`, `INVENTORY`, and `WAREHOUSES`
- `EvidenceCollector`, `EvidenceClock`, and
  `createEvidenceCollector({ commerce, clock? })`
- Concurrent order-scoped reads followed by deduplicated inventory and
  warehouse reads
- Safe `FAILED` and dependency `SKIPPED` metadata without raw errors
- Deterministic record ordering and source-derived timestamps

Phase 6 verification passed:

- Evidence package: 4 tests, 81 assertions, including a live restricted-role
  integration over six approved orders
- Full database package: 7 tests, 104 assertions
- Root build 14/14, typecheck 14/14, test 19/19, and lint 2/2 Turbo tasks
- Final demo counts unchanged and all operations tables empty

Phase 7 adds:

- `EvidenceReadinessResultSchema` with canonical missing paths, structured
  inventory conflicts, and `CONFLICTING > MISSING > COMPLETE` precedence
- `EvidenceReadinessEvaluator` and `createEvidenceReadinessEvaluator()`
- Conditional payment, shipment, event, fulfilment, inventory, and warehouse
  gates that stop requiring unrelated downstream evidence after a decisive path
- A Phase 6 correction that retains warehouse evidence from either successful
  fulfilment or successful inventory dependencies

Phase 7 verification passed:

- Diagnosis package: 9 tests, 63 assertions, including all nine approved orders
  through `WORKFLOW_DATABASE_URL`
- Evidence package: 6 tests, 94 assertions after the warehouse correction
- Database package: 7 tests, 104 assertions
- Root build 14/14, typecheck 14/14, test 20/20, and lint 2/2 Turbo tasks
- Final demo counts unchanged and all operations tables empty

Phase 8 adds:

- `InvestigationDecisionSchema` with finite versioned rule IDs, confirmed
  confidence, selected ordered facts, escalation guidance, and
  `commerceStateChanged=false`
- `DiagnosisEngine` with payment, shipment, decisive failure, assigned-stock,
  four-hour processing, and safe fallback precedence
- Deterministic alternative-warehouse eligibility without reservation,
  reassignment, retry, or any other commerce action
- Processing chronology based only on `evidence.collectedAt`; no real-time
  clock or wall-clock freshness threshold

Phase 8 verification passed:

- Diagnosis package: 18 tests, 147 assertions, including all nine approved
  orders through `WORKFLOW_DATABASE_URL`
- Evidence package: 6 tests, 94 assertions; database package: 7 tests, 104
  assertions; access checks: 6 tests, 68 assertions
- Final demo counts unchanged and all operations tables empty

Phase 9 adds:

- public Zod contracts for investigation, escalation, persisted evidence,
  review cases, safe audit events, traces, and finite workflow errors;
- narrow operations repository reads and atomic investigation, idempotency,
  audit, and case persistence through `WORKFLOW_DATABASE_URL`;
- `CommerceOperationsWorkflow` with explicit investigation, separate
  escalation, case lookup, and trace lookup use cases;
- exact idempotency replay, client-request reuse, one case per investigation,
  safe technical-failure persistence, and concurrency recovery; and
- an explicit schema-owner-only `db:reset-workflow-demo` command that clears
  only the five operations tables outside runtime code.

Phase 9 verification includes the nine approved investigations, seven eligible
cases, rejection of `ORD-1044` and `ORD-1047`, exact retry behavior,
concurrent retry races, transaction rollback, immutable trace reads, unchanged
commerce fixtures, and zero operations rows after cleanup. Full command output
is recorded in the
[Phase 9 evaluation report](docs/evaluations/phase-09-persistence-escalation.md).

## Demo database commands

```bash
bun run db:migrate
bun run db:setup-access
bun run db:verify-access
bun run db:seed
bun run db:verify-demo
bun run db:reset-demo
bun run db:reset-workflow-demo
```

`DATABASE_URL` is the schema-owner/migration connection.
`DEMO_DATABASE_URL` is the explicit non-production commerce seed/reset
connection. `WORKFLOW_DATABASE_URL` is the restricted runtime repository
connection. For local setup with missing role URLs, run
`bun run db:setup-access:local`; generated credentials are written only to the
ignored `packages/db/.env`.

Use `db:seed` for an empty migrated demo database. Use the explicit
non-production `db:reset-demo` command to restore commerce fixtures.
`db:reset-workflow-demo` is a separate schema-owner-only cleanup for the five
operations tables; it is blocked when `NODE_ENV=production` and never changes
commerce. API startup never creates roles, seeds, resets, or connects to
PostgreSQL.

The fixture validation command is:

```bash
bun run --filter @repo/fixtures test
```

The commerce seed contains no operational fixes and no workflow records.
Investigations and escalations are created only by explicit Phase 9 workflow
calls.

Plan-intake checks completed:

- `pdfinfo docs/plans/Diligence_AI_Commerce_Operations_Final_Plan_Updated.pdf` - 13 pages, PDF 1.7, unencrypted.
- `shasum -a 256 docs/plans/Diligence_AI_Commerce_Operations_Final_Plan_Updated.pdf` - `cccc22a5bf3ffae29364c5be78c8b26ed9a2f89c6501fb9cc3abffcbb741d802`, matching the supplied source file.

## Demo cases

| Order      | Scenario                          | Expected result                   | Escalation |
| ---------- | --------------------------------- | --------------------------------- | ---------- |
| `ORD-1042` | Assigned warehouse out of stock   | `ASSIGNED_WAREHOUSE_OUT_OF_STOCK` | Yes        |
| `ORD-1043` | Fulfilment creation failed        | `FULFILMENT_CREATION_FAILED`      | Yes        |
| `ORD-1044` | Within expected processing window | `WITHIN_EXPECTED_PROCESSING_TIME` | No         |
| `ORD-1045` | Shipment label creation failed    | `SHIPMENT_LABEL_CREATION_FAILED`  | Yes        |
| `ORD-1046` | Missing inventory evidence        | `NEEDS_MORE_INFO`                 | Yes        |
| `ORD-1047` | Shipment already exists           | `SHIPMENT_ALREADY_EXISTS`         | No         |
| `ORD-1048` | Cause not determined              | `CAUSE_NOT_DETERMINED`            | Yes        |
| `ORD-1049` | Source does not confirm payment   | `PAYMENT_NOT_CONFIRMED`           | Yes        |
| `ORD-1050` | Conflicting inventory evidence    | `NEEDS_MORE_INFO`                 | Yes        |

## Safety guarantee for this prototype

The intended runtime exposes no commerce-state mutation capability. Operational commerce data is read-only. Allowed writes are limited to investigations, immutable evidence snapshots, human-review escalations, idempotency records, and append-only audit events.

Phase 4 proves with the actual restricted connection that the workflow role can
read commerce data but cannot insert, update, delete, or truncate it. Phase 9
uses narrow atomic commands to write only the five approved operations tables.
The live nine-case test confirmed unchanged commerce fixtures and created seven
cases only after explicit escalation calls. The API still exposes no workflow,
database, MCP, or commerce-mutation capability.
