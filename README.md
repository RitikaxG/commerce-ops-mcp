# AI-First Commerce Operations Investigator

This repository will implement a bounded operations workflow that explains why a paid order has not reached shipment creation and can create a persistent human-review escalation.

## Current state

Phases 0, 1, and 2 are complete. Phase 3 has implemented the approved synthetic scenario contract, validated fixtures, PostgreSQL migration, and explicit seed/reset flow on `phase/03-approved-synthetic-scenarios`; it is awaiting review.

The existing Bun/Turborepo and Prisma setup was reused rather than reinitialized. The repository builds and typechecks, the Express API returns `{"status":"ok"}` from `GET /health`, and the web application remains a static Tailwind trace-viewer shell. PostgreSQL now contains the validated nine-order commerce seed and empty workflow tables. No investigation workflow, diagnosis engine, AI behavior, or MCP implementation exists yet.

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

| Phase | Status          | Main output                                                    | Evaluation                                                 |
| ----- | --------------- | -------------------------------------------------------------- | ---------------------------------------------------------- |
| 0     | Complete        | Workflow contract and repository rules                         | [Report](docs/evaluations/phase-00.md)                     |
| 1     | Complete        | [Approved PostgreSQL schema](docs/database/schema-proposal.md) | [Report](docs/evaluations/phase-01.md)                     |
| 2     | Complete        | Bun and Turborepo foundation                                   | [Report](docs/evaluations/phase-02.md)                     |
| 3     | Awaiting review | Approved scenarios, validation, PostgreSQL seed/reset          | [Report](docs/evaluations/phase-03-synthetic-scenarios.md) |
| 4     | Not started     | Remaining database hardening; scope must be reconciled         | Not created                                                |
| 5     | Not started     | Repositories and read-only commerce boundary                   | Not created                                                |
| 6     | Not started     | Evidence collection and normalization                          | Not created                                                |
| 7     | Not started     | Evidence readiness and conflict gate                           | Not created                                                |
| 8     | Not started     | Deterministic diagnosis and suggested action                   | Not created                                                |
| 9     | Not started     | Persistent investigation and escalation workflow               | Not created                                                |
| 10    | Not started     | Standard remote MCP server                                     | Not created                                                |
| 11    | Not started     | Agent behavior and LLM evaluations                             | Not created                                                |
| 12    | Not started     | Trace APIs and minimal Tailwind viewer                         | Not created                                                |
| 13    | Not started     | Hardening, deployment, and submission evidence                 | Not created                                                |

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

During review, internal package exports were corrected to resolve TypeScript
source directly. Build, typecheck, lint, the bundled Node API health check, and
read-only database verification passed after the correction. The remote
PostgreSQL write-transaction test needs one more clean rerun after it exceeded
Prisma's five-second interactive transaction timeout; the earlier Phase 3 full
test run remains recorded in the evaluation report.

## Demo database commands

```bash
bun run db:migrate
bun run db:seed
bun run db:verify-demo
bun run db:reset-demo
```

Use `db:seed` for an empty migrated demo database. Use the explicit non-production `db:reset-demo` command to restore an existing demo database. API startup never seeds or resets data.

The fixture validation command is:

```bash
bun run --filter @repo/fixtures test
```

Investigations and escalations are created only when later workflow code runs. The seed contains no operational fixes and no workflow records.

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

Phase 3 writes commerce data only through explicit non-production seed/reset commands. The runtime application still exposes no database or commerce-mutation capability. Dedicated runtime-role permissions and forbidden-DML tests remain required before runtime database access is added.
