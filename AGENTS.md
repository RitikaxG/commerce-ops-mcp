# AGENTS.md

## Product goal

Diagnose why a paid order has not reached shipment creation and create a persistent human-review escalation without changing commerce state.

## Current gate

- Phases 0 through 11 are accepted and merged into `main`.
- Phase 11 was merged through PR #10 at `28632a46c1d8166a4f0967ce3e8373e2ee1e0de3`.
- Phase 12 work belongs only on `phase/12-aws-hosted-mcp`.
- Phase 12 makes the accepted MCP deployable to one always-on AWS EC2 instance and adds provider-independent and model-backed hosted verification.
- Do not create AWS resources until the repository owner explicitly approves deployment.
- Do not commit to `main`, merge the Phase 12 branch, or expose any secret.
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
- All inputs and structured outputs validate through shared schemas.
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

- `packages/schemas`: public Zod and TypeScript contracts; no infrastructure imports.
- `packages/db`: Prisma, clients, transactions, repositories, migrations, and owner-only testing helpers.
- `packages/fixtures`: frozen scenarios and explicit seed/reset/verify composition.
- `packages/evidence`: normalized source collection through repository contracts.
- `packages/diagnosis`: pure readiness and deterministic diagnosis.
- `packages/observability`: safe audit builders and trace reads.
- `packages/workflow`: orchestration, persistence, idempotency, escalation, and safe workflow errors.
- `packages/mcp`: the five approved tool adapters and MCP error mapping.
- `apps/api`: Express composition, `/health`, authenticated `/mcp`, Host validation, transport lifecycle, and graceful shutdown.
- `packages/evaluations`: direct, hosted direct, and explicit model-backed evaluations; never imported by runtime code.
- `packages/agent`: provider-neutral model boundary, Gemini provider, exact MCP discovery, host-generated identifiers, tool policy, grounding validation, CLI, and smoke check.

Prisma remains private to `packages/db`. Runtime packages never import fixtures or evaluations. The AI host reaches the workflow only through Streamable HTTP MCP.

## Database credential boundary

- `DATABASE_URL` is schema-owner only and is used for explicit migrations.
- `DEMO_DATABASE_URL` is used only for explicit synthetic seed/reset operations.
- `WORKFLOW_DATABASE_URL` is the restricted runtime connection: commerce `SELECT`, scoped operations writes, and approved investigation outcome updates.
- The running API container receives only `WORKFLOW_DATABASE_URL`.
- The running API must not receive `DATABASE_URL`, `DEMO_DATABASE_URL`, or `MODEL_API_KEY`.
- Migrations, role creation, access verification, and seeding are explicit one-off admin operations.
- Do not run migrations or reset demo data automatically at API startup.
- Do not expose reset or cleanup through MCP.
- PostgreSQL triggers enforce terminal investigation consistency, immutable evidence, append-only audit events, escalation derivation, and idempotency-resource validity.

## Remote transport and authentication

- Use pinned `@modelcontextprotocol/sdk` v1; the accepted resolved version is `1.30.0`.
- Use stateless Streamable HTTP at `/mcp` with JSON responses.
- Do not implement legacy HTTP+SSE.
- Validate the Host header before MCP processing.
- Protect only `/mcp` with `Authorization: Bearer <MCP_API_KEY>`.
- Keep `GET /health` unauthenticated and model-independent.
- Production requires explicit non-wildcard `MCP_ALLOWED_HOSTS` and a strong `MCP_API_KEY`.
- Missing authorization returns HTTP 401 `MCP_AUTH_REQUIRED`.
- Malformed or incorrect authorization returns HTTP 401 `MCP_AUTH_INVALID`.
- Compare tokens safely; never log or return either token.
- Authentication must complete before creating the workflow context.
- Do not add users, sessions, OAuth, refresh tokens, or browser credentials.

## Phase 11 model boundary

Gemini is used only for natural-language interaction and approved tool selection. The deterministic workflow remains authoritative for evidence, diagnosis, escalation policy, persistence, and audit behavior.

- Keep `MODEL_PROVIDER=gemini`, the accepted model name, serialized requests, bounded retries, and safe `RATE_LIMITED` / `QUOTA_EXHAUSTED` errors.
- Mutation requests are refused before any model or MCP call.
- The Gemini key stays on a trusted client or evaluation runner; it is not part of the hosted MCP runtime.
- Model-provider failure must not disable `/health`, direct MCP use, persisted investigations, review cases, or trace retrieval.

## Phase 12 deployment boundary

Use the minimum one-instance deployment:

- Ubuntu 24.04 LTS on `t3.small` with 20 GB gp3.
- Elastic IP and `commerce-mcp.ritikaxg.co.in`.
- Docker Engine and Docker Compose.
- PostgreSQL 16 container with a persistent named volume.
- Existing TypeScript API container.
- Caddy for HTTPS and the only public ports.

Public endpoints:

- `GET https://commerce-mcp.ritikaxg.co.in/health`
- `POST https://commerce-mcp.ritikaxg.co.in/mcp`

Do not expose ports 3000 or 5432. The security group allows public 80/443 and restricts SSH to the owner's current public IP. Do not add Kubernetes, ECS, an Application Load Balancer, RDS, or complex CI/CD.

The production Compose stack contains `postgres`, `api`, and `caddy`. A disabled-by-default `admin` profile is allowed only for explicit migrations, role setup, access verification, and synthetic seeding.

## Required hosted verification

### Provider-independent

`bun run verify:hosted:mcp` must:

1. use `MCP_SERVER_URL` and `MCP_AUTH_BEARER_TOKEN`;
2. connect to an already-running endpoint without spawning a local API;
3. verify public `/health`;
4. initialize Streamable HTTP MCP;
5. discover exactly five tools and their accepted schemas;
6. list the nine approved scenarios;
7. investigate `ORD-1042` and match the frozen result;
8. create an escalation only from the stored investigation;
9. read the review case and investigation trace;
10. verify unknown-order safety and mutation-tool absence;
11. confirm `commerceStateChanged=false`;
12. require no model-provider key.

### Model-backed

`bun run verify:hosted:ai` must:

1. verify hosted health and exact MCP discovery before provider calls;
2. target the already-running hosted MCP URL;
3. run only the existing nine natural-language scenario investigations;
4. preserve serialized Gemini requests and bounded retries;
5. compare deterministic scenario expectations;
6. confirm `commerceStateChanged=false`;
7. distinguish `HOSTED_MCP` failures from `MODEL_PROVIDER` failures;
8. keep live provider verification manual and outside required CI.

MCP Inspector and one MCP-compatible AI-client demonstration are required after owner-approved deployment. The optional trace viewer must not block or replace these demonstrations.

## Verification and deployment gate

Before AWS work:

- verify `.env.local` is ignored;
- install frozen dependencies;
- run formatting, typecheck, tests, lint, database migrations, role/access tests, workflow regressions, and direct MCP evaluation;
- build the production Docker image;
- start the production Compose stack locally;
- verify `/health`, missing/invalid/valid bearer behavior, Host rejection, malformed JSON, restricted runtime credentials, and internal-only API/PostgreSQL ports;
- run the provider-independent hosted verifier with no `MODEL_API_KEY`.

Do not suppress tests, weaken assertions, or make the live Gemini evaluation a required CI check.

After owner-approved AWS deployment, record the deployed SHA, AWS region, health URL, MCP URL, deployment timestamp, last verification timestamp, and an intended shutdown timestamp at least seven complete days after submission. Keep restart policies, persistent volumes, EC2 status monitoring, safe log commands, and manual recovery instructions. This review-window commitment is not an SLA.

## Repository conventions

- Bun is the only package manager.
- TypeScript strict mode and ESM.
- No new `src/` directories.
- Node.js 20.9.0 or newer.
- Use Zod for external/untrusted contracts.
- Keep public APIs small and exported through package roots.
- Do not introduce Redis, queues, Kafka, RAG, multi-agent orchestration, event sourcing, user authentication systems, or a new commerce backend.
- Never commit `.env` files, credentials, production data, local database dumps, generated secrets, private keys, raw provider payloads, or unredacted evidence.

## Branch and review boundary

- Work only on `phase/12-aws-hosted-mcp`.
- Keep changes minimal and scoped to authentication, hosted verification, EC2 deployment configuration, and evidence documentation.
- Do not deploy AWS resources without explicit owner confirmation.
- Do not merge the Phase 12 branch.
- Before a pull request, provide exact verification results, changed files, environment variables still needed, branch status, and confirmation that no secrets or protected environment files are tracked.
