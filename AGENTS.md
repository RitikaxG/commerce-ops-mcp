# AGENTS.md

## Product goal

Diagnose why a paid order has not reached shipment creation and create a persistent human-review escalation without changing commerce state.

## Current gate

- Phases 0 through 10 are accepted and merged.
- Phase 9 was merged to `main` as `d11b589fabe9e16222953bb251e39ba79c73887a`.
- The initial Phase 10 MCP implementation was merged to `main` as `355960c2a3441a05430de8cbf87234bb8285ff18`.
- The Phase 10 completion work was merged through PR #9 as `ef80769506bcb3b78b03cbc6a5333d153d2919e1`.
- The direct Streamable HTTP MCP evaluation and combined Phase 9/10 verification passed.
- Phase 11 is implemented on `phase/11-gemini-ai-host` with Gemini, provider-neutral host contracts, key-free tests, and an explicit live evaluator.
- Phase 11 remains awaiting review and real model validation. Do not merge or begin hosted staging until `eval:agent:gemini` passes with a rotated `MODEL_API_KEY`.
- The API key previously pasted into chat is exposed and must never be used, logged, stored, or committed.

## Permanent safety boundary

- Operational commerce state is runtime read-only.
- Allowed writes are limited to investigations, immutable evidence snapshots, human-review escalations, idempotency records, and append-only audit events in `operations`.
- Forbidden: order, payment, inventory, fulfilment, event, shipment, or warehouse mutation.
- Forbidden: raw SQL tools, unrestricted API/fetch tools, reservation, reassignment, hold release, fulfilment retry, or shipment creation/retry.
- A recommendation is a proposal for human review, never evidence that an operational action occurred.
- Every investigation and escalation result states `commerceStateChanged=false`.
- Hidden model chain of thought, credentials, SQL, raw provider payloads, and unrestricted source dumps must not be persisted or returned.

## Database boundary

- `DATABASE_URL` is schema-owner only.
- `DEMO_DATABASE_URL` is for explicit non-production commerce seed/reset only.
- `WORKFLOW_DATABASE_URL` is the runtime connection: commerce `SELECT`, scoped operations writes, and approved investigation outcome updates.
- The runtime may not invoke demo or workflow cleanup helpers.
- `bun run db:reset-workflow-demo` is owner-only, destructive to demo operations rows, and prohibited in production.
- PostgreSQL triggers enforce terminal investigation consistency, immutable evidence, append-only audit events, escalation derivation, and idempotency-resource validity.

## Approved scenarios

The frozen matrix contains exactly nine orders:

- `ORD-1042`: assigned warehouse out of stock; human review in `FULFILMENT_OPERATIONS`.
- `ORD-1043`: fulfilment creation failed; `FULFILMENT_OPERATIONS`.
- `ORD-1044`: within expected processing time; no escalation.
- `ORD-1045`: shipment-label creation failed; `SHIPPING_OPERATIONS`.
- `ORD-1046`: missing assigned-warehouse inventory; `NEEDS_MORE_INFO`, no diagnosis, `OPERATIONS_DATA_REVIEW`.
- `ORD-1047`: shipment already exists; no escalation.
- `ORD-1048`: cause not determined; `GENERAL_COMMERCE_OPERATIONS`.
- `ORD-1049`: payment not confirmed; `PAYMENT_OPERATIONS`.
- `ORD-1050`: conflicting inventory; `NEEDS_MORE_INFO`, no diagnosis, `OPERATIONS_DATA_REVIEW`.

Synthetic evidence uses the fixed reference time `2026-07-30T12:00:00.000Z`. Wall-clock age alone does not invalidate the demo evidence.

## Package ownership

- `packages/schemas`: public Zod and TypeScript contracts; no infrastructure imports.
- `packages/db`: Prisma, clients, transactions, repositories, migrations, and owner-only testing helpers.
- `packages/fixtures`: frozen scenarios and explicit seed/reset/verify composition.
- `packages/evidence`: normalized source collection through repository contracts.
- `packages/diagnosis`: pure readiness and deterministic diagnosis; schemas-only runtime dependency.
- `packages/observability`: safe audit builders and trace reads.
- `packages/workflow`: orchestration, persistence, idempotency, escalation, and safe workflow errors.
- `packages/mcp`: the five approved tool adapters and MCP error mapping; imports only schemas, workflow, and the official MCP SDK.
- `apps/api`: Express composition, health, `/mcp`, Host validation, transport lifecycle, and graceful shutdown.
- `packages/evaluations`: direct protocol and explicit model evaluations; may consume top-level runtime packages but is never imported by runtime code.
- `packages/agent`: provider-neutral model boundary, Gemini provider, system instructions, exact MCP discovery, hidden host-generated identifiers, tool policy, compact projections, grounding validation, CLI, and smoke check.
- `apps/web`: later read-only trace viewer; no direct database access.

Prisma remains private to `packages/db`. Packages never import application code. Runtime packages never import evaluations or fixtures. `packages/agent` never imports workflow, MCP server implementation, DB, Prisma, evidence, diagnosis, observability internals, fixtures, evaluations, or applications; it reaches the workflow only through Streamable HTTP MCP.

## Phase 10 MCP surface

Register exactly:

- `list_demo_cases`
- `investigate_order_exception`
- `create_human_review_escalation`
- `get_review_case`
- `get_investigation_trace`

The server must advertise no prompts, generic resources, SQL tools, CRUD tools, unrestricted HTTP tools, or operational mutation tools.

Tool rules:

- `list_demo_cases`, `get_review_case`, and `get_investigation_trace` are read-only.
- Investigation and escalation are non-destructive operations-workflow writes and idempotent by their approved keys.
- Investigation never creates a review case automatically.
- Escalation accepts only `investigationId` and `idempotencyKey`; queue, reason, order, and next step are server-derived.
- All inputs and structured outputs validate through shared schemas.
- Expected workflow failures return finite safe envelopes; unexpected failures map to `INTERNAL_ERROR`.

## Remote transport

- Use stable `@modelcontextprotocol/sdk` v1; current resolved version is `1.30.0`.
- Use Streamable HTTP at `/mcp`.
- Use stateless mode with JSON responses.
- Do not implement legacy HTTP+SSE.
- Validate the Host header before MCP processing.
- Production requires a nonempty explicit `MCP_ALLOWED_HOSTS`; wildcards are forbidden.
- Keep `GET /health` unchanged and `x-powered-by` disabled.
- Do not add duplicate REST routes for MCP workflow actions.

## Phase 10 direct evaluation

`bun run eval:mcp:direct` must:

1. clear only demo operations rows through the owner-only cleanup boundary;
2. verify the approved commerce fixtures;
3. build and start the real Express API on a temporary local port;
4. connect using the official `Client` and `StreamableHTTPClientTransport`;
5. discover exactly five tools and no prompt/resource capabilities;
6. execute all nine investigations and compare frozen outcomes;
7. create seven eligible review cases and reject `ORD-1044`/`ORD-1047` escalation;
8. verify exact retry, idempotency-key conflict, second-key case reuse, case reads, and trace reads;
9. reject forbidden tools, extra business fields, malformed identifiers, and disallowed hosts;
10. prove commerce fixtures are unchanged;
11. always clear operations rows in `finally` and verify final zero workflow counts.

The direct evaluator is explicit and serial. Do not place destructive cleanup inside parallel root tests.

## Phase 11 implementation boundary

Phase 11 owns:

- `MODEL_PROVIDER=gemini`;
- exact stable `MODEL_NAME=gemini-3.6-flash`;
- server-side `MODEL_API_KEY` only;
- `@google/genai@2.13.0`;
- Gemini Interactions API with `store:false`;
- manual function declaration and execution;
- exact five-tool MCP discovery;
- model-facing schemas that hide reliability fields;
- host-generated client-request and idempotency keys;
- one approved tool call per model turn;
- bounded investigation-before-escalation ordering;
- compact tool-result projection;
- structured grounded explanation and one repair attempt;
- refusal, prompt-injection, stability, token, and cost evaluation.

The model must use MCP tools and explain server-produced structured outcomes. It must not calculate diagnosis, queue, reason, suggested action, evidence readiness, conflict resolution, or warehouse eligibility. It must never receive idempotency keys, database URLs, or unrestricted evidence.

Mutation requests are refused before any model or MCP call. Investigation and escalation remain separate. A combined request may escalate only after the investigation returns `shouldEscalate=true`.

`bun run eval:agent:gemini` is explicit, serial, paid/live, and never part of ordinary tests. It must use a rotated key, real Gemini API, official MCP client, real `/mcp`, restricted workflow role, complete commerce before/after comparison, and final owner-only cleanup.

## Hosted staging boundary

After Phase 11 passes locally, deploy a protected HTTPS staging MCP endpoint before Phase 12. The AI host must switch between local and hosted MCP through `MCP_SERVER_URL` and optional `MCP_AUTH_BEARER_TOKEN` without code changes.

Host validation alone is not authentication. Staging must add authentication, explicit production hosts, hosted restricted PostgreSQL credentials, health checks, safe logs, Inspector proof, and repeated Gemini-host evaluation. Phase 12 adds the read-only trace viewer; Phase 13 finalizes production authentication and submission hardening.

## Repository conventions

- Bun is the only package manager.
- TypeScript strict mode and ESM.
- No `src/` directories.
- Node.js 20.9.0 or newer.
- Use Zod for every external/untrusted contract.
- Keep public APIs small and exported through package roots.
- Do not introduce Redis, queues, Kafka, RAG, multi-agent orchestration, event sourcing, or complex production authentication.
- Never commit `.env`, credentials, production data, local database dumps, generated secrets, or private AI transcripts.

## Required Phase 11 review packet

Before Phase 11 is accepted, show:

- selected model provider, model name, SDK, API method, and environment contract;
- provider-neutral model boundary and concrete Gemini implementation;
- exact model-facing tool schemas and proof reliability identifiers are host-generated;
- natural-language intent and exact order-ID extraction results;
- correct MCP tool selection and ordering;
- grounded explanation results against server-produced structured output;
- no invented evidence, diagnosis, queue, reason, warehouse, identifier, or state changes;
- refusal of mutation requests and forbidden-tool attempts;
- prompt-injection and adversarial model results;
- three-run stability results;
- token/cost and frozen evaluation settings;
- direct MCP regression and commerce before/after proof;
- final zero workflow counts;
- confirmation that no key, raw provider response, hidden reasoning, or transcript was committed;
- files changed, lockfile/env changes, and proposed merge details.
