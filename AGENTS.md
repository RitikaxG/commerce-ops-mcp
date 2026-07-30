# AGENTS.md

## Product goal

Diagnose why a paid order has not reached shipment creation and create a persistent human-review escalation without changing commerce state.

## Current gate

- Phases 0 through 10 are accepted and merged.
- Phase 9 was merged to `main` as `d11b589fabe9e16222953bb251e39ba79c73887a`.
- The initial Phase 10 MCP implementation was merged to `main` as `355960c2a3441a05430de8cbf87234bb8285ff18`.
- The Phase 10 completion work was merged through PR #9 as `ef80769506bcb3b78b03cbc6a5333d153d2919e1`.
- The direct Streamable HTTP MCP evaluation and combined Phase 9/10 verification passed.
- Phase 11 may add one concrete LLM provider only after `MODEL_PROVIDER`, `MODEL_NAME`, and `MODEL_API_KEY` are selected.

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
- `packages/evaluations`: direct protocol and later model evaluations; may consume top-level runtime packages but is never imported by runtime code.
- `packages/agent`: Phase 11 host-neutral model instructions and provider/evaluation helpers.
- `apps/web`: later read-only trace viewer; no direct database access.

Prisma remains private to `packages/db`. Packages never import application code. Runtime packages never import evaluations or fixtures.

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

## Phase 11 boundary

Phase 11, not Phase 10, owns:

- `MODEL_PROVIDER`
- `MODEL_NAME`
- `MODEL_API_KEY`
- one concrete provider SDK
- AI-host tool discovery and selection
- tool-order evaluation
- grounded explanation evaluation
- refusal, prompt-injection, and adversarial model evaluation

The model must use MCP tools and explain server-produced structured outcomes. It must not calculate diagnosis, queue, reason, or operational actions itself.

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

- selected model provider, model name, and environment contract;
- provider-neutral model boundary and one concrete provider implementation;
- natural-language intent and order-ID extraction results;
- correct MCP tool selection and ordering;
- grounded explanation results against server-produced structured output;
- no invented evidence, diagnosis, queue, reason, or state changes;
- refusal of mutation requests and forbidden-tool attempts;
- prompt-injection and adversarial evaluation results;
- token/cost and deterministic evaluation settings;
- confirmation that commerce remains unchanged;
- files changed, lockfile/env changes, and proposed merge details.
