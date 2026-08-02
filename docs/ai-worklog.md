# AI Worklog

This worklog summarizes how AI was used to plan, implement, debug, test, review, and document the assignment. It is intentionally concise; a complete private transcript is not included.

## AI tools and models

| Tool or model | Role in the work | Selection reason |
| --- | --- | --- |
| ChatGPT / Codex-compatible coding assistant | Planning, architecture discussion, implementation guidance, debugging, test design, deployment review, and documentation review | Supported long-running repository context, iterative code review, and structured verification plans |
| Exact coding-assistant model | **[Owner to confirm exact model before submission]** | The repository does not independently prove the exact model used across every coding session |
| Gemini `gemini-3.6-flash` through `@google/genai` | Product-side natural-language tool selection and grounded explanation | Fast model suitable for a bounded five-tool workflow; provider implementation remains behind a neutral model interface |
| Gemini CLI v0.53.1, model selection shown as `Auto` | Independent MCP-compatible AI-client verification | Demonstrated that a third-party compatible client could discover and use the hosted MCP without repository internals |
| MCP Inspector v2 | Protocol inspection rather than code generation | Independently verified the remote transport, tool catalog, inputs, structured outputs, and persisted trace |

The exact model selected by Gemini CLI's `Auto` mode is not asserted because the captured evidence does not identify it.

## How AI was used

### Ambiguity reduction and product planning

AI helped turn the open-ended assignment into one bounded operations question:

> Why has this paid order not reached shipment creation?

It was used to compare possible scopes, identify the primary user, define success and stop conditions, separate operational recommendation from execution, and draft questions and progress updates for the client.

### Phase and dependency planning

AI helped decompose the work into reviewed phases covering:

1. workflow contract;
2. PostgreSQL schema;
3. synthetic scenario matrix;
4. database permissions and invariants;
5. read-only repositories;
6. evidence normalization;
7. evidence readiness and conflict handling;
8. deterministic diagnosis;
9. persistence, idempotency, escalation, and audit;
10. remote MCP and direct protocol evaluation;
11. provider-neutral AI host and Gemini integration;
12. authenticated AWS hosting and external-client verification.

The phase gates reduced the chance of allowing generated implementation to outrun accepted product decisions.

### Architecture and implementation support

AI was used to propose and review:

- package ownership and dependency direction;
- Zod contracts and MCP tool descriptions;
- PostgreSQL role separation and invariants;
- evidence and diagnosis boundaries;
- idempotency behavior;
- MCP transport and authentication handling;
- provider-neutral model interfaces;
- grounding checks and mutation refusal;
- Docker Compose, Caddy, and EC2 deployment steps.

Generated suggestions were treated as proposals, not as accepted design.

### Debugging

AI assisted with forming hypotheses, reading error output, and narrowing failures involving:

- MCP output schemas;
- generated JSON Schema strictness;
- Host-header tests;
- Prisma client generation;
- Turbo environment forwarding;
- hosted database verification;
- Gemini 429 and quota behavior;
- deployment environment and credential boundaries.

Every proposed correction was checked against the workflow contract and then verified through focused tests or a live run.

### Testing and review

AI helped enumerate the behavior that mattered most:

- all nine scenario outcomes;
- missing and conflicting evidence stopping diagnosis;
- no automatic escalation during investigation;
- safe idempotent retries;
- forbidden tool and field rejection;
- read-only commerce state;
- immutable snapshots and append-only audit events;
- model grounding and mutation refusal;
- distinction between provider failure and MCP failure;
- hosted verification through independent clients.

AI also reviewed the final documentation for stale phase status and reviewer usability.

## Human and AI responsibility split

### Owner responsibilities

The repository owner remained responsible for:

- selecting and bounding the product problem;
- deciding that commerce operations is the primary user;
- approving the workflow contract, schema, and scenario matrix;
- deciding which evidence is authoritative;
- keeping diagnosis deterministic rather than model-generated;
- approving every phase before the next phase began;
- reviewing generated code and documentation;
- running tests and inspecting exact failures;
- creating and protecting credentials;
- provisioning and operating AWS resources;
- testing the live MCP through Inspector and Gemini CLI;
- deciding when branches were ready to merge;
- communicating assumptions, blockers, and tradeoffs to the client.

### AI responsibilities

AI contributed:

- alternatives and tradeoff analysis;
- implementation scaffolding and refactoring suggestions;
- focused debugging hypotheses;
- draft tests, documentation, and commands;
- review checklists and failure-mode analysis.

AI was not permitted to:

- redefine the accepted business outcome;
- supply real customer data or production credentials;
- decide a diagnosis from free-form reasoning;
- mutate commerce state;
- bypass tests or phase review;
- claim that a result passed without observed evidence.

## Important prompts and persistent instructions

The most important context supplied to AI included:

- the accepted workflow contract and bounded question;
- the exact five MCP tools;
- runtime read-only commerce and scoped workflow writes;
- no order, payment, inventory, fulfilment, event, warehouse, or shipment mutation;
- no raw SQL or unrestricted HTTP tool;
- complete evidence required before diagnosis;
- missing or conflicting evidence must produce `NEEDS_MORE_INFO` without a diagnosis;
- queue, reason, and next step must be server-derived;
- no secret values in code, logs, screenshots, or commits;
- focused verification and explicit evidence before merge;
- do not overbuild a frontend, RAG, queues, or user-management system.

[`AGENTS.md`](../AGENTS.md) served as the persistent repository instruction source for coding agents.

## AI suggestions corrected, rejected, or substantially changed

### 1. Model-owned diagnosis was rejected

The model was limited to approved tool selection and explanation. Evidence readiness, diagnosis, escalation eligibility, queue, and next step remain deterministic server decisions.

### 2. Reliability identifiers were kept in trusted host code

The model-facing investigation tool accepts only `orderId`. The host creates `clientRequestId` and idempotency keys and reuses them across exact retries. This avoids depending on model-generated reliability fields.

### 3. Provider failure was separated from MCP failure

Repeated Gemini 429 responses initially made the overall demonstration appear unavailable. The final design identifies `MODEL_PROVIDER` failure separately and keeps direct hosted MCP use independently verifiable.

### 4. A separate hosted chat or model proxy was rejected

The assignment requires a hosted MCP, not an additional hosted AI gateway. Adding one would introduce provider credentials, cost controls, rate limiting, privacy handling, and another authentication surface without improving the central MCP contract.

### 5. Clean-state hosted verification was replaced

A verifier that expected an empty workflow schema was correct for disposable CI but unsafe after real hosted calls persisted evidence. It was replaced by a hosted-safe before/after invariant check that preserves reviewer records.

### 6. Overbuilding was rejected

Suggestions involving a frontend, RAG, multi-agent orchestration, queues, Kafka, Redis, user authentication, Kubernetes, or automatic operational actions were excluded because they did not improve the bounded workflow within the assignment scope.

### 7. Free-tier deployment with inactivity sleep was rejected

The final hosted MCP uses an always-on EC2 instance so asynchronous reviewers do not encounter a predictable idle spin-down and cold-start boundary.

## How AI-generated work was verified

AI-assisted work was accepted only after one or more of these checks:

- strict TypeScript typechecking;
- Zod validation of external contracts;
- package-level unit and integration tests;
- PostgreSQL permission and invariant tests;
- deterministic fixture verification;
- direct MCP evaluation through the official client and real HTTP route;
- comparison of commerce state before and after workflow execution;
- repository build, test, lint, and CI runs;
- production-like Docker Compose verification;
- hosted provider-independent verification;
- hosted-safe database verification;
- MCP Inspector manual testing;
- nine-scenario live Gemini evaluation;
- independent Gemini CLI MCP-client verification;
- manual review of screenshots, logs, and credential boundaries.

A passing model response by itself was never treated as proof that the workflow was correct.

## Remaining risks and unfinished work

- The deployment is a single EC2 instance with containerized PostgreSQL and no automated failover.
- The reviewer token is a shared deployment credential and must be rotated after review.
- Model-provider latency and quota remain external dependencies for model-backed interaction.
- The fixtures are synthetic and use a fixed reference clock.
- No production commerce APIs or real customer data are connected.
- Existing investigation evidence is immutable; updated source evidence requires a new investigation.
- The product recommends actions but does not execute them.
- The final four-to-five-minute demo video is still pending.

## Owner confirmation before submission

- [ ] Replace **[Owner to confirm exact model before submission]** with the exact ChatGPT/Codex coding model, if known.
- [ ] Confirm whether any additional AI coding tool or model should be listed.
- [ ] Add the final asynchronous demo video link to the README.
