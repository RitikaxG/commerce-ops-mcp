# Engineering Decisions, Tradeoffs, and Bugs

This document consolidates the product and technical judgment behind the final submission. It focuses on decisions that materially affect safety, correctness, reviewer usability, and the role of MCP.

## Architecture decisions and tradeoffs

| Decision | Why | Cost or limitation | Future production direction |
| --- | --- | --- | --- |
| Deterministic TypeScript diagnosis | Business outcomes remain reproducible, testable, and independent of model phrasing | New diagnoses require reviewed rule and fixture changes | Version rules and evaluate them against production-quality replay datasets |
| MCP as the only AI-to-workflow interface | Keeps the model behind a strict, inspectable capability boundary | Every useful AI action must be expressed as a well-designed MCP tool | Add capabilities only when they preserve bounded inputs, outputs, and side effects |
| Read-only `commerce` schema at runtime | Prevents accidental order, payment, inventory, fulfilment, or shipment mutation | The product cannot execute an operational fix | Introduce separately authorized mutation services only after stronger identity, policy, approval, and rollback controls |
| Scoped `operations` writes | Investigations, evidence, escalations, idempotency, and audit history can persist safely | Requires more schema and invariant work than an in-memory demo | Move workflow storage to a managed highly available database when needed |
| Immutable decision-time evidence snapshots | A reviewer can reconstruct exactly what evidence supported a decision | Existing investigation evidence is not refreshed when sources change | Create a new investigation and link it to the previous one as a superseding run |
| New investigation for changed evidence | Avoids silently rewriting history and invalidating old audit conclusions | Repeated checks create additional workflow records | Add explicit lineage, retention, and comparison views |
| Separate escalation tool | Human-review creation is an explicit action rather than a hidden side effect of investigation | Requires a second tool call | Preserve the separation; add policy-driven approvals only when the user model is defined |
| Server-derived queue, reason, and next step | Prevents the model or caller from inventing operational ownership | Less flexible than free-form escalation input | Expand only through reviewed enums and deterministic mapping |
| Idempotency for investigations and escalations | Retries return the same logical resource instead of creating duplicates | Callers must manage keys correctly | Add tenant-aware idempotency namespaces and retention policies |
| Stateless Streamable HTTP MCP | Simple remote deployment and broad client compatibility | No server-side MCP session state | Add session state only for a proven workflow need |
| Client-owned model-provider credential | The hosted MCP contains no Gemini key and stays provider-independent | Each AI client must provide its own model access | Offer an optional separately secured AI gateway only if product requirements justify it |
| Sequential Gemini provider calls | Reduces pressure on a constrained free-tier rate limit and makes retry order predictable | Higher latency and low throughput | Use paid quota, concurrency controls, or provider-specific capacity when demand requires it |
| Bounded provider retries | Prevents infinite loops and communicates temporary failure clearly | Cannot overcome exhausted daily or project quota | Add circuit breaking and workload admission controls for production |
| Provider failure separated from MCP failure | A model outage does not falsely imply that the deterministic workflow is unavailable | Reviewers must understand two availability boundaries | Expose separate provider and MCP health metrics |
| Shared bearer token for the review window | Minimal secure access without overbuilding user management | No per-reviewer identity, audit attribution, or fine-grained revocation | Replace with OAuth or workload identity for multi-user production access |
| AWS EC2 instead of a sleeping free-tier web service | Keeps the MCP continuously available during asynchronous review and avoids cold-start uncertainty | Manual operations and a fixed instance cost | Move to managed compute only when operational requirements justify it |
| One EC2 instance with local PostgreSQL | Coherent, inexpensive, and easy to inspect for a bounded assignment | Single point of failure and no automated failover | Separate compute and managed PostgreSQL, then add backups, monitoring, and recovery objectives |
| No frontend | Prioritizes MCP design, backend correctness, persistence, and hosted verification | Less visually approachable for non-technical operators | Add a thin operations interface only after validating the workflow |
| No automatic commerce action | Preserves human accountability and eliminates irreversible demo behavior | Operations remain responsible for executing the recommendation | Add guarded actions only with explicit approval, least privilege, and compensating controls |
| Nine frozen synthetic scenarios | Enables repeatable evaluation of complete, missing, conflicting, normal, and failure states | Does not cover the breadth or drift of a real commerce system | Add anonymized replay fixtures, contract tests, and monitored rule coverage |

## Important engineering problems solved

### 1. MCP failure results were rejected by the advertised output schema

**Symptom**

Valid workflow failures returned a structured error envelope, but the MCP SDK rejected them because the tool advertised only its success schema.

**Root cause**

The runtime returned both success and finite failure envelopes while the advertised output contract described only success.

**Correction**

Each tool now advertises a union containing the concrete success envelope and the finite MCP failure envelope. Returned values are validated before leaving the adapter.

**Verification**

Direct MCP evaluation exercises safe workflow failures, unknown identifiers, invalid inputs, and internal-error mapping through the real Streamable HTTP endpoint.

**Lesson**

A tool contract must describe every legitimate structured result, including expected failure states.

### 2. Strict schema intersections generated contradictory JSON Schema

**Symptom**

Valid normalized source-read records failed schema validation in MCP tooling.

**Root cause**

A strict base object was intersected with source-specific strict objects. The generated JSON Schema combined incompatible `additionalProperties=false` constraints.

**Correction**

The intersection was replaced with complete source-specific strict schemas in the tuple/union.

**Verification**

Schema tests and the nine-scenario direct MCP evaluation validate every normalized evidence source through the published contracts.

**Lesson**

Runtime validation composition can produce a structurally valid TypeScript type but an unusable generated JSON Schema. External protocol schemas must be inspected independently.

### 3. The Host-header security test did not test the real boundary

**Symptom**

A test intended to send a disallowed `Host` header could pass without proving that the server received the overridden value.

**Root cause**

High-level `fetch` behavior did not reliably preserve the manually supplied `Host` header.

**Correction**

The test uses a lower-level HTTP request path that sends the exact header to the real Express application.

**Verification**

The direct evaluator receives HTTP 403 with `MCP_HOST_NOT_ALLOWED` for the disallowed host and verifies that no workflow or commerce state changed.

**Lesson**

Security tests must confirm the transport actually sends the condition being tested.

### 4. Static CI ran before Prisma client generation

**Symptom**

TypeScript checks failed in a clean CI environment even though the project worked after local generation.

**Root cause**

The generated Prisma client was assumed to exist before typecheck and package tests.

**Correction**

CI now runs `bun run db:generate` before checks that import generated Prisma types.

**Verification**

Phase 10 through Phase 12 static and regression workflows pass from clean checkouts.

**Lesson**

Generated dependencies must be explicit, reproducible build steps rather than local-machine assumptions.

### 5. Turborepo did not forward required database variables

**Symptom**

Repository-level test commands failed in CI while package-level commands succeeded.

**Root cause**

Turbo tasks did not receive the approved database environment variables required by the test runtime.

**Correction**

Only the necessary database variables were added to the relevant Turbo task environment forwarding.

**Verification**

Repository-wide build, typecheck, tests, lint, DB verification, and direct MCP evaluation pass in CI.

**Lesson**

Task runners create an environment boundary that should be configured deliberately and minimally.

### 6. The clean-state database verifier was unsafe after hosted reviewer activity

**Symptom**

The original permission suite expected the workflow schema to be empty after its transaction. Hosted MCP calls intentionally persisted investigations, review cases, and traces, so rerunning the clean-state assertion would fail or tempt destructive cleanup.

**Root cause**

A correct CI invariant was reused in a different lifecycle: a live deployment containing legitimate reviewer evidence.

**Correction**

A hosted-safe verifier records workflow counts and a commerce fingerprint, performs permission checks inside a rolled-back transaction, and confirms the before/after state is unchanged. It never deletes hosted evidence.

**Verification**

The hosted command completed with `3 pass, 0 fail` while preserving existing workflow records and commerce state.

**Lesson**

Verification must be lifecycle-aware. A test that is safe for a disposable database can be destructive or misleading against a live review environment.

### 7. Gemini free-tier rate limiting interrupted extended live evaluation

**Symptom**

After the nine core scenarios completed, additional model-backed checks received repeated `429 RATE_LIMITED` responses with long retry delays.

**Root cause**

The external provider's free-tier throughput and quota were lower and less predictable than the deterministic MCP workflow.

**Correction**

Provider requests are serialized and paced. Transient 429, timeout, and 5xx failures use bounded retries. Daily or project quota exhaustion returns a clear provider error rather than an infinite loop or a false MCP failure.

**Verification**

All nine hosted model-backed scenarios completed successfully in the final run. The host recorded sequential execution, 18 model calls, and `commerceStateChanged=false`. Provider-independent MCP verification remained available throughout.

**Lesson**

External model reliability must be isolated from core workflow correctness and communicated as a separate product boundary.

## Decisions deliberately not implemented

The final submission intentionally excludes:

- a frontend or design system;
- automatic commerce mutations;
- OAuth, sessions, and user-management infrastructure;
- Redis, queues, Kafka, or event sourcing;
- RAG and multi-agent orchestration;
- a separately hosted model proxy or chat endpoint;
- Kubernetes, ECS, a load balancer, or managed multi-service deployment;
- real customer data or production commerce credentials.

These omissions are scope decisions, not unfinished hidden dependencies. The submission prioritizes one coherent workflow, a central MCP contract, deterministic safety, and reviewer-verifiable hosted behavior.
