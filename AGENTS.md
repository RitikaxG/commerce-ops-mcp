# AGENTS.md

## Product goal

Diagnose why a paid order has not reached shipment creation and create a persistent human-review escalation without changing commerce state.

## Current gate

- Phases 0 through 12 are complete and merged into `main`.
- Phase 12 was merged through PR #11 at `c4fb3eed9aa6a9a14d42f33087f86099fe12382b`.
- The final deployed application SHA is `3ac6c89da3f7d7675256c23cc65e257e4e10892b`.
- Current work is documentation-only final submission packaging on `docs/final-submission-packaging`.
- Do not change runtime behavior, schemas, migrations, tests, workflows, deployment configuration, or infrastructure during packaging.
- Do not deploy, merge, or expose any secret without explicit repository-owner approval.
- The previously exposed Gemini key must never be reused, logged, stored, or committed.

## Permanent safety boundary

- Operational commerce state is runtime read-only.
- Allowed writes are limited to investigations, immutable evidence snapshots, human-review escalations, idempotency records, and append-only audit events in `operations`.
- Forbidden: order, payment, inventory, fulfilment, event, shipment, or warehouse mutation.
- Forbidden: raw SQL tools, unrestricted API/fetch tools, reservation, reassignment, hold release, fulfilment retry, or shipment creation/retry.
- A recommendation is a proposal for human review, never evidence that an operational action occurred.
- Every investigation and escalation result states `commerceStateChanged=false`.
- Hidden model reasoning, credentials, SQL, raw provider payloads, and unrestricted source dumps must not be persisted or returned.

## Accepted MCP contract

Register exactly:

1. `list_demo_cases`
2. `investigate_order_exception`
3. `create_human_review_escalation`
4. `get_review_case`
5. `get_investigation_trace`

The server advertises no prompts, generic resources, SQL tools, CRUD tools, unrestricted HTTP tools, operational mutation tools, reset tools, or cleanup tools.

Tool rules:

- `list_demo_cases`, `get_review_case`, and `get_investigation_trace` are read-only.
- Investigation and escalation are non-destructive workflow writes and idempotent by their approved keys.
- Investigation never creates a review case automatically.
- Escalation accepts only `investigationId` and `idempotencyKey`; queue, reason, order, and next step are server-derived.
- All external inputs and structured outputs validate through shared Zod schemas.
- Expected workflow failures return finite safe envelopes; unexpected failures map to `INTERNAL_ERROR`.

## Approved scenarios

The frozen matrix contains exactly nine synthetic orders:

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

- `packages/config`: environment and shared configuration parsing.
- `packages/schemas`: public Zod and TypeScript contracts; no infrastructure imports.
- `packages/db`: Prisma, migrations, clients, transactions, repositories, and owner-only testing helpers.
- `packages/fixtures`: frozen scenarios and explicit seed/reset/verify composition.
- `packages/evidence`: normalized source collection through repository contracts.
- `packages/diagnosis`: pure readiness, conflict detection, and deterministic diagnosis.
- `packages/observability`: safe audit builders and trace reads.
- `packages/workflow`: orchestration, persistence, idempotency, escalation, and safe workflow errors.
- `packages/mcp`: exact five tool adapters, descriptions, annotations, transport handler, and safe MCP error mapping.
- `apps/api`: Express composition, `/health`, authenticated `/mcp`, Host validation, transport lifecycle, and graceful shutdown.
- `packages/agent`: provider-neutral model boundary, Gemini provider, exact MCP discovery, host-generated identifiers, tool policy, grounding validation, CLI, and smoke checks.
- `packages/evaluations`: direct, hosted direct, and explicit model-backed evaluations; never imported by runtime code.

Prisma remains private to `packages/db`. Runtime packages never import fixtures or evaluations. The AI host reaches the workflow only through Streamable HTTP MCP.

## Database credential boundary

- `DATABASE_URL` is schema-owner only and is used for explicit migrations.
- `DEMO_DATABASE_URL` is used only for explicit synthetic seed/reset operations.
- `WORKFLOW_DATABASE_URL` is the restricted runtime connection: commerce `SELECT`, scoped operations writes, and approved investigation lifecycle updates.
- The running API container receives only `WORKFLOW_DATABASE_URL` and `MCP_API_KEY`.
- The running API must not receive `DATABASE_URL`, `DEMO_DATABASE_URL`, or `MODEL_API_KEY`.
- Migrations, role creation, access verification, and seeding are explicit one-off admin operations.
- Do not run migrations or reset demo data automatically at API startup.
- Do not expose reset or cleanup through MCP.
- PostgreSQL triggers enforce terminal investigation consistency, immutable evidence, append-only audit events, escalation derivation, and idempotency-resource validity.

## Remote transport and authentication

- Use pinned `@modelcontextprotocol/sdk` v1; the accepted resolved version is `1.30.0`.
- Use stateless Streamable HTTP at `/mcp` with JSON responses.
- Validate the Host header before MCP processing.
- Protect only `/mcp` with `Authorization: Bearer <MCP_API_KEY>`.
- Keep `GET /health` unauthenticated and model-independent.
- Production requires explicit non-wildcard `MCP_ALLOWED_HOSTS` and a strong `MCP_API_KEY`.
- Missing authorization returns HTTP 401 `MCP_AUTH_REQUIRED`.
- Malformed or incorrect authorization returns HTTP 401 `MCP_AUTH_INVALID`.
- Compare tokens safely; never log or return either token.
- Authentication must complete before creating the workflow context.
- Do not add users, sessions, OAuth, refresh tokens, or browser credentials during submission packaging.

## Model boundary

Gemini is used only for natural-language interaction and approved tool selection. The deterministic workflow remains authoritative for evidence, diagnosis, escalation policy, persistence, and audit behavior.

- Keep `MODEL_PROVIDER=gemini`, the accepted model name, serialized requests, bounded retries, and safe `RATE_LIMITED` / `QUOTA_EXHAUSTED` errors.
- Mutation requests are refused before any model or MCP call.
- Reliability identifiers are generated in trusted host code and reused across exact retries.
- The Gemini key stays on a trusted client or evaluation runner; it is not part of the hosted MCP runtime.
- Model-provider failure must not disable `/health`, direct MCP use, persisted investigations, review cases, or trace retrieval.

## Hosted deployment boundary

The accepted deployment uses:

- Ubuntu 24.04 LTS on `t3.small` with 20 GB encrypted gp3;
- Elastic IP and `commerce-mcp.ritikaxg.co.in`;
- Docker Engine and Docker Compose;
- PostgreSQL 16 with a persistent named volume;
- the TypeScript API container;
- Caddy for HTTPS and the only public ports.

Public endpoints:

- `GET https://commerce-mcp.ritikaxg.co.in/health`
- `POST https://commerce-mcp.ritikaxg.co.in/mcp`

Do not expose ports 3000 or 5432. Do not add Kubernetes, ECS, an Application Load Balancer, RDS, or complex CI/CD as part of final packaging.

## Accepted verification

The final system has passed:

- repository build, typecheck, tests, and lint;
- database migration, fixture, access, and invariant checks;
- direct MCP evaluation through the official client;
- local production Compose verification;
- hosted provider-independent verification;
- hosted-safe database verification;
- MCP Inspector verification;
- hosted nine-scenario model-backed evaluation;
- Gemini CLI verification as an independent MCP-compatible AI client;
- runtime credential-isolation checks;
- commerce-state comparison with `commerceStateChanged=false`.

Do not weaken assertions, fabricate results, or make the live model provider a required deterministic CI dependency.

## Final packaging rules

- Documentation must describe the merged and deployed state accurately.
- Distinguish the deployed application SHA, final Phase 12 branch head, merge commit, and later documentation-only commit.
- Use only redacted screenshots. Never commit token controls, Authorization values, model keys, DB URLs, SSH material, or environment files.
- Keep the README reviewer-focused; link detailed phase history rather than reproducing it.
- The demo-video link remains explicitly incomplete until the owner records and supplies it.
- Do not add a frontend, hosted chat service, OAuth, Redis, queues, Kafka, RAG, multi-agent orchestration, new scenarios, or new MCP tools.

## Repository conventions

- Bun is the only package manager.
- TypeScript strict mode and ESM.
- Node.js 20.9.0 or newer.
- Use Zod for external and untrusted contracts.
- Keep public APIs small and exported through package roots.
- Never commit `.env` files, credentials, production data, local database dumps, generated secrets, private keys, raw provider payloads, or unredacted evidence.
