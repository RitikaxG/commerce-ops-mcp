# AI-First Commerce Operations Investigator

This repository implements a bounded operations workflow that explains why a paid order has not reached shipment creation and can create a persistent human-review escalation.

## Current state

Phases 0 through 10 are complete. Phase 10 provides a standard remote MCP server on `/mcp` with five approved tools, strict Zod contracts, Streamable HTTP transport, Host-header protection, safe error mapping, and a passing direct MCP-client evaluation across all nine approved scenarios.

Phase 11 is implemented on `phase/11-gemini-ai-host` and is awaiting real Gemini evaluation with a rotated API key. The branch adds a provider-neutral AI host, Gemini Interactions API adapter, exact MCP discovery, host-generated reliability identifiers, sequential tool policy, grounded explanation validation, a server-side CLI, key-free tests, and an explicit live model evaluator.

The deterministic workflow remains authoritative for evidence readiness, diagnosis, escalation policy, persistence, and audit behavior. Gemini selects approved tools and explains validated server results; it never calculates or changes the diagnosis, queue, next step, or commerce state.

Local prerequisites are Bun 1.3.2 and Node.js 20.9.0 or newer.

## Plan and working instructions

- [Final plan](docs/plans/Diligence_AI_Commerce_Operations_Final_Plan_Updated.pdf)
- [Workflow contract](docs/workflow-contract.md)
- [Package graph](docs/architecture/package-graph.md)
- [Approved PostgreSQL schema](docs/database/schema-proposal.md)
- [Schema acceptance summary](docs/database/client-review-summary.md)
- [Approved synthetic scenarios](docs/scenarios/approved-synthetic-scenarios.md)
- [Post-Phase 11 staging handoff](docs/deployment/post-phase-11-staging-handoff.md)
- [Coding-agent instructions](AGENTS.md)

## Implementation status

| Phase | Status                   | Main output                                              | Evaluation                                                            |
| ----- | ------------------------ | -------------------------------------------------------- | --------------------------------------------------------------------- |
| 0     | Complete                 | Workflow contract and repository rules                   | [Report](docs/evaluations/phase-00.md)                                |
| 1     | Complete                 | Approved PostgreSQL schema                               | [Report](docs/evaluations/phase-01.md)                                |
| 2     | Complete                 | Bun and Turborepo foundation                             | [Report](docs/evaluations/phase-02.md)                                |
| 3     | Complete                 | Approved scenarios, validation, PostgreSQL seed/reset    | [Report](docs/evaluations/phase-03-synthetic-scenarios.md)            |
| 4     | Complete                 | Roles, grants, immutable records, cross-table invariants | [Report](docs/evaluations/phase-04-database-hardening.md)             |
| 5     | Complete                 | Repositories and read-only commerce boundary             | [Report](docs/evaluations/phase-05-readonly-commerce-repositories.md) |
| 6     | Complete                 | Evidence collection and normalization                    | [Report](docs/evaluations/phase-06-evidence-collector.md)             |
| 7     | Complete                 | Evidence readiness and conflict gate                     | [Report](docs/evaluations/phase-07-evidence-readiness.md)             |
| 8     | Complete                 | Deterministic diagnosis and suggested action             | [Report](docs/evaluations/phase-08-diagnosis-engine.md)               |
| 9     | Complete                 | Persistent investigation and escalation workflow         | [Report](docs/evaluations/phase-09-persistence-escalation.md)         |
| 10    | Complete                 | Remote MCP server and direct tool evaluations            | [Report](docs/evaluations/phase-10-remote-mcp.md)                     |
| 11    | Awaiting live evaluation | Gemini AI host and model-backed MCP evaluations          | [Report](docs/evaluations/phase-11-gemini-ai-host.md)                 |
| 12    | Not started              | Trace APIs and minimal Tailwind viewer                   | Not created                                                           |
| 13    | Not started              | Hardening, deployment, and submission evidence           | Not created                                                           |

## Phase 11 local commands

Create an ignored `.env.local` containing a **rotated** Gemini key and the accepted configuration:

```text
MODEL_PROVIDER=gemini
MODEL_NAME=gemini-3.6-flash
MODEL_API_KEY=<rotated key>
MCP_SERVER_URL=http://127.0.0.1:3000/mcp
```

Verify model access:

```bash
bun --env-file=.env.local run agent:model-smoke
```

With the local MCP API running, ask the host using natural language only:

```bash
bun --env-file=.env.local run agent:ask -- "Investigate ORD-1042"
```

The host generates `clientRequestId` and idempotency keys internally. The user does not supply them.

Run the explicit serial live suite only after ordinary tests and direct MCP evaluation stop:

```bash
bun --env-file=.env.local run eval:agent:gemini
bun run db:verify-demo
```

The live evaluator uses the real Gemini API, official MCP client, real Streamable HTTP `/mcp` endpoint, all nine scenarios, tool-order and refusal checks, prompt-injection checks, stability runs, commerce before/after comparison, token/cost reporting, and final workflow cleanup.

## Phase 10 regression commands

```bash
bun install --frozen-lockfile
bun run --filter @repo/mcp test
bun run --filter @repo/api test
bun run --filter @repo/evaluations test
bun run build
bun run typecheck
bun run eval:mcp:direct
bun run db:verify-demo
```

The direct evaluator builds and starts the real Express API, connects with the official MCP client over Streamable HTTP, executes all nine scenarios, verifies escalation and idempotency behavior, checks forbidden tools and invalid inputs, proves commerce remains unchanged, and clears operations demo rows in `finally`.
