# AI-First Commerce Operations Investigator

This repository implements a bounded operations workflow that explains why a paid order has not reached shipment creation and can create a persistent human-review escalation.

## Current state

Phases 0 through 10 are complete. Phase 10 provides a standard remote MCP server on `/mcp` with five approved tools, strict Zod contracts, Streamable HTTP transport, Host-header protection, safe error mapping, and a passing direct MCP-client evaluation across all nine approved scenarios.

The deterministic workflow remains authoritative for evidence readiness, diagnosis, escalation policy, persistence, and audit behavior. The MCP layer only validates and adapts approved workflow capabilities. Actual LLM/AI-host integration and model-backed evaluations remain Phase 11 work.

Local prerequisites are Bun 1.3.2 and Node.js 20.9.0 or newer.

## Plan and working instructions

- [Final plan](docs/plans/Diligence_AI_Commerce_Operations_Final_Plan_Updated.pdf)
- [Workflow contract](docs/workflow-contract.md)
- [Package graph](docs/architecture/package-graph.md)
- [Approved PostgreSQL schema](docs/database/schema-proposal.md)
- [Schema acceptance summary](docs/database/client-review-summary.md)
- [Approved synthetic scenarios](docs/scenarios/approved-synthetic-scenarios.md)
- [Coding-agent instructions](AGENTS.md)

## Implementation status

| Phase | Status | Main output | Evaluation |
| --- | --- | --- | --- |
| 0 | Complete | Workflow contract and repository rules | [Report](docs/evaluations/phase-00.md) |
| 1 | Complete | Approved PostgreSQL schema | [Report](docs/evaluations/phase-01.md) |
| 2 | Complete | Bun and Turborepo foundation | [Report](docs/evaluations/phase-02.md) |
| 3 | Complete | Approved scenarios, validation, PostgreSQL seed/reset | [Report](docs/evaluations/phase-03-synthetic-scenarios.md) |
| 4 | Complete | Roles, grants, immutable records, cross-table invariants | [Report](docs/evaluations/phase-04-database-hardening.md) |
| 5 | Complete | Repositories and read-only commerce boundary | [Report](docs/evaluations/phase-05-readonly-commerce-repositories.md) |
| 6 | Complete | Evidence collection and normalization | [Report](docs/evaluations/phase-06-evidence-collector.md) |
| 7 | Complete | Evidence readiness and conflict gate | [Report](docs/evaluations/phase-07-evidence-readiness.md) |
| 8 | Complete | Deterministic diagnosis and suggested action | [Report](docs/evaluations/phase-08-diagnosis-engine.md) |
| 9 | Complete | Persistent investigation and escalation workflow | [Report](docs/evaluations/phase-09-persistence-escalation.md) |
| 10 | Complete | Remote MCP server and direct tool evaluations | [Report](docs/evaluations/phase-10-remote-mcp.md) |
| 11 | Not started | Actual AI-host integration and model evaluations | Not created |
| 12 | Not started | Trace APIs and minimal Tailwind viewer | Not created |
| 13 | Not started | Hardening, deployment, and submission evidence | Not created |

## Phase 10 commands

Run the non-destructive checks first:

```bash
bun install --frozen-lockfile
bun run --filter @repo/mcp test
bun run --filter @repo/api test
bun run --filter @repo/evaluations test
bun run build
bun run typecheck
```

The direct evaluation is intentionally explicit and serial because it uses the configured PostgreSQL roles and owner-only workflow cleanup:

```bash
bun run eval:mcp:direct
bun run db:verify-demo
```

The evaluator builds and starts the real Express API, connects with the official MCP client over Streamable HTTP, executes all nine scenarios, verifies escalation and idempotency behavior, checks forbidden tools and invalid inputs, proves commerce remains unchanged, and clears operations demo rows in `finally`.

No model provider, model name, or LLM API key is required until Phase 11.
