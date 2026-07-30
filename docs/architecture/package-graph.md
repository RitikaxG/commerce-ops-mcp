# Package Graph

## Status and scope

This Phase 0 document freezes dependency direction and ownership. It defines planned boundaries, not implemented packages or concrete TypeScript signatures.

The current starter does not match this graph. Phase 0 does not rename, delete, move, or scaffold application/package code.

## Dependency direction

```mermaid
flowchart TD
  Host["MCP-compatible AI host"] --> API["apps/api"]
  Web["apps/web<br/>read-only trace viewer"] -->|HTTP only| API
  Web --> Schemas

  API --> Config["packages/config"]
  API --> DB["packages/db"]
  API --> MCP["packages/mcp"]
  API --> Obs["packages/observability"]

  MCP --> Schemas["packages/schemas"]
  MCP --> Workflow["packages/workflow"]

  Workflow --> Schemas
  Workflow --> DB
  Workflow --> Evidence["packages/evidence"]
  Workflow --> Diagnosis["packages/diagnosis"]
  Workflow --> Obs

  Evidence --> Schemas
  Evidence --> DB
  Diagnosis --> Schemas
  Obs --> Schemas
  Obs --> DB
  DB --> Config
  DB --> Schemas

  Fixtures["packages/fixtures"] --> Schemas
  Fixtures --> DB
  Agent["packages/agent"] --> Schemas

  Evaluations["packages/evaluations"] --> Fixtures
  Evaluations --> Agent
  Evaluations --> MCP
  Evaluations --> Workflow

  DB --> Commerce[("PostgreSQL commerce<br/>runtime SELECT only")]
  DB --> Operations[("PostgreSQL operations<br/>scoped workflow writes")]
```

The diagram shows the primary allowed relationships. The ownership table below is authoritative for allowed imports. Arrows mean "may depend on or call"; the browser-to-API arrow is an HTTP relationship, not a source-code import.

## Ownership and allowed imports

| Component                | Owns                                                                                         | May import                                                |
| ------------------------ | -------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `apps/api`               | Express composition, `/health`, `/mcp`, and read-only trace/investigation/case routes        | `config`, `db`, `mcp`, `observability`                    |
| `apps/web`               | Minimal Tailwind read-only trace viewer                                                      | Shared response types from `schemas`; API over HTTP       |
| `packages/config`        | Shared TypeScript, environment, and test configuration                                       | No domain/runtime package                                 |
| `packages/schemas`       | Zod schemas and public protocol/domain types                                                 | No infrastructure package                                 |
| `packages/db`            | Prisma, migrations, database clients, transactions, repository contracts and implementations | `config`, `schemas`                                       |
| `packages/fixtures`      | Typed synthetic cases, fixture validation, and explicit seed/reset helpers                   | `schemas`, `db`                                           |
| `packages/evidence`      | Evidence collection, source normalization, source timestamps, and warehouse eligibility      | `schemas`, repository contracts from `db`                 |
| `packages/diagnosis`     | Evidence readiness/conflict gate and deterministic diagnosis rules                           | `schemas` only                                            |
| `packages/observability` | Internal trace event vocabulary, safe summaries, and trace queries                           | `schemas`, repository contracts from `db`                 |
| `packages/workflow`      | Investigation and escalation orchestration, persistence, idempotency, and audit coordination | `schemas`, `db`, `evidence`, `diagnosis`, `observability` |
| `packages/mcp`           | Approved tool registration, descriptions, input/output adapters, and MCP error mapping       | `schemas`, `workflow`                                     |
| `packages/agent`         | Host-neutral tool-use/explanation/refusal instructions and model-evaluation helpers          | `schemas`                                                 |
| `packages/evaluations`   | Scenario, guardrail, contract, and model evaluations                                         | Runtime packages under test, `fixtures`, and `agent`      |

## Planned public surfaces

These names describe ownership and dependency seams. Their exact TypeScript signatures are not frozen in Phase 0.

| Owner           | Conceptual public surface                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `schemas`       | Zod input/output, evidence, diagnosis, investigation, escalation, and trace contracts                                     |
| `db`            | Read-only commerce repository contracts, operations repository contracts, transaction runner, and configured constructors |
| `evidence`      | `EvidenceCollector` returning a normalized order investigation snapshot                                                   |
| `diagnosis`     | `EvidenceReadinessEvaluator` and `DiagnosisEngine`                                                                        |
| `observability` | Safe trace event writer contract and read-only trace queries                                                              |
| `workflow`      | `InvestigationWorkflow` and `HumanReviewWorkflow`                                                                         |
| `mcp`           | Registration for the five approved domain tools                                                                           |
| `agent`         | Host-neutral instructions and evaluation case adapters                                                                    |

Rules for later public APIs:

- Validate untrusted/external values with Zod contracts from `packages/schemas`.
- Export supported APIs from package roots; do not expose arbitrary internal paths.
- Do not expose the Prisma client outside `packages/db`.
- Do not put business rules in repositories, MCP adapters, applications, or the LLM.
- Do not add a generic utility/package dependency merely to avoid choosing an owner.

## Acyclic layering

The graph has this topological direction:

1. `config`, `schemas`
2. `db`, `diagnosis`, `agent`
3. `fixtures`, `evidence`, `observability`
4. `workflow`
5. `mcp`
6. `apps/api`
7. `apps/web` over HTTP and `evaluations` as top-level consumers

No lower layer imports a higher layer. In particular:

- packages never import application code;
- `db` does not import `evidence`, `diagnosis`, `workflow`, or `mcp`;
- `evidence` consumes repository contracts without importing Prisma;
- `diagnosis` imports schemas only;
- `workflow` does not import MCP or application code;
- runtime packages never import `evaluations`; and
- `apps/web` never accesses PostgreSQL directly.

## Current repository differences

| Current starter state                                | Contract treatment                                                                                         |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `apps/api` is absent                                 | Do not scaffold it before Phase 2 and Phase 1 schema acceptance.                                           |
| `apps/web` is a generic Next.js starter              | Preserve it until the later scaffold phase; the target remains a secondary read-only trace viewer.         |
| `packages/ui/src/` exists                            | It violates the no-`src/` convention; do not fix it in Phase 0.                                            |
| `packages/db` contains a Prisma skeleton             | Preserve it, but do not add models/migrations before schema acceptance; its public API remains unapproved. |
| Most target domain packages are absent               | Target domain behavior remains unimplemented.                                                              |
| `@repo/ui` exports wildcard compiled component paths | This is a starter API, not an approved target domain API.                                                  |

`apps/docs` was removed by the user after Phase 0 review because it has no product responsibility.

## Rejected dependency alternatives

- App code shared by importing from `apps/*` into packages.
- Prisma imports in `diagnosis`, `evidence`, `workflow`, MCP adapters, or the web app.
- Repository interfaces owned by `evidence` when that would force `db` to import upward and create a cycle.
- Direct database access from `apps/web`.
- Business-rule duplication across MCP adapters, routes, and model instructions.
- Redis, queues, Kafka, RAG, multi-agent orchestration, or event sourcing in the initial graph.

## Change control

Later phases may refine names or split an interface when implementation evidence requires it. Any changed dependency direction, new package, or expanded public surface must be recorded in `AGENTS.md` and the relevant phase evaluation report before acceptance.
