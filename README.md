# AI-First Commerce Operations Investigator

This repository will implement a bounded operations workflow that explains why a paid order has not reached shipment creation and can create a persistent human-review escalation.

## Current state

Phase 0 is complete. Phase 1 schema documents are ready and awaiting client schema approval.

The user removed `apps/docs` and initialized a Prisma skeleton in `packages/db`. The Prisma schema remains empty. No proposed Phase 1 entity, migration, application workflow, AI behavior, or MCP implementation exists in code.

## Plan and working instructions

- [Final plan](docs/plans/Diligence_AI_Commerce_Operations_Final_Plan_Updated.pdf)
- [Workflow contract](docs/workflow-contract.md)
- [Package graph](docs/architecture/package-graph.md)
- [PostgreSQL schema proposal](docs/database/schema-proposal.md)
- [Client review summary](docs/database/client-review-summary.md)
- [How to use the phase prompts](docs/plans/how-to-use-phase-prompts.md)
- [Coding-agent instructions](AGENTS.md)

Review the Phase 1 proposal, client summary, [evaluation report](docs/evaluations/phase-01.md), `AGENTS.md`, and this status table. Approve the schema or request revisions.

Phase 1 is a client-review gate. It may design and document the scoped PostgreSQL schema, but application scaffolding, Prisma migrations, AI behavior, and MCP implementation must wait until the schema is accepted.

## Implementation status

| Phase | Status                          | Main output                                                    | Evaluation                             |
| ----- | ------------------------------- | -------------------------------------------------------------- | -------------------------------------- |
| 0     | Complete                        | Workflow contract and repository rules                         | [Report](docs/evaluations/phase-00.md) |
| 1     | Awaiting client schema approval | [PostgreSQL schema proposal](docs/database/schema-proposal.md) | [Report](docs/evaluations/phase-01.md) |
| 2     | Not started                     | Bun and Turborepo foundation                                   | Not created                            |
| 3     | Not started                     | Zod contracts and synthetic scenarios                          | Not created                            |
| 4     | Not started                     | Approved PostgreSQL schema and seed                            | Not created                            |
| 5     | Not started                     | Repositories and read-only commerce boundary                   | Not created                            |
| 6     | Not started                     | Evidence collection and normalization                          | Not created                            |
| 7     | Not started                     | Evidence readiness and conflict gate                           | Not created                            |
| 8     | Not started                     | Deterministic diagnosis and suggested action                   | Not created                            |
| 9     | Not started                     | Persistent investigation and escalation workflow               | Not created                            |
| 10    | Not started                     | Standard remote MCP server                                     | Not created                            |
| 11    | Not started                     | Agent behavior and LLM evaluations                             | Not created                            |
| 12    | Not started                     | Trace APIs and minimal Tailwind viewer                         | Not created                            |
| 13    | Not started                     | Hardening, deployment, and submission evidence                 | Not created                            |

## Verified commands

Phase 0 verified the current workspace with:

- `bunx prettier --check AGENTS.md README.md docs/**/*.md`
- `bun run --filter @repo/ui check-types`
- `bun run --filter @repo/ui build:components`
- `bun run check-types`
- `bun run --filter @repo/ui lint`
- `bun run lint`

The desktop shell required `/Users/ritikagupta/.bun/bin` on `PATH`. The first root typecheck exposed a starter prerequisite: `@repo/ui` must be built before the apps can resolve its generated `dist` exports. The typecheck passed after that package-level build.

See the [Phase 0 evaluation report](docs/evaluations/phase-00.md) for expected and actual results. No migrate, seed, reset, development, evaluation-harness, or runtime workflow command exists or was claimed for this documentation-only phase.

Phase 1 checks passed for required schema tokens/ER references, client-summary consistency, Markdown formatting, whitespace, unchanged `packages/db`, and absence of migrations. Mermaid CLI was unavailable, so the ERD received manual syntax review. Full results are in the [Phase 1 evaluation report](docs/evaluations/phase-01.md).

No Prisma model, generation, validation, migration, or database command was run.

Plan-intake checks completed:

- `pdfinfo docs/plans/Diligence_AI_Commerce_Operations_Final_Plan_Updated.pdf` - 13 pages, PDF 1.7, unencrypted.
- `shasum -a 256 docs/plans/Diligence_AI_Commerce_Operations_Final_Plan_Updated.pdf` - `cccc22a5bf3ffae29364c5be78c8b26ed9a2f89c6501fb9cc3abffcbb741d802`, matching the supplied source file.

## Demo cases

These are planned synthetic scenarios, not implemented fixtures.

| Order      | Scenario                          | Expected result                   |
| ---------- | --------------------------------- | --------------------------------- |
| `ORD-1042` | Assigned warehouse out of stock   | `ASSIGNED_WAREHOUSE_OUT_OF_STOCK` |
| `ORD-1043` | Fulfilment creation failed        | `FULFILMENT_CREATION_FAILED`      |
| `ORD-1044` | Within expected processing window | `WITHIN_EXPECTED_PROCESSING_TIME` |
| `ORD-1045` | Shipment label creation failed    | `SHIPMENT_LABEL_CREATION_FAILED`  |
| `ORD-1046` | Missing inventory evidence        | `NEEDS_MORE_INFO`                 |
| `ORD-1047` | Shipment already exists           | `SHIPMENT_ALREADY_EXISTS`         |
| `ORD-1048` | Cause not determined              | `CAUSE_NOT_DETERMINED`            |
| `ORD-1049` | Source does not confirm payment   | `PAYMENT_NOT_CONFIRMED`           |
| `ORD-1050` | Conflicting inventory evidence    | `NEEDS_MORE_INFO`                 |

## Safety guarantee for this prototype

The intended runtime exposes no commerce-state mutation capability. Operational commerce data is read-only. Allowed writes are limited to investigations, immutable evidence snapshots, human-review escalations, idempotency records, and append-only audit events.

This is currently a documented boundary, not yet an implemented or tested guarantee. Phase reports and guardrail tests must provide the evidence as implementation proceeds.
