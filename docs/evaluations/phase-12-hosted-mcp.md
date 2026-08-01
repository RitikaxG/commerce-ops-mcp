# Phase 12 hosted MCP evaluation

## Status

- Implementation branch: `phase/12-aws-hosted-mcp`
- Base: merged `main` containing Phase 11
- Local production verification: PASS
- Phase 12 static and production Compose CI: PASS
- AWS deployment: PASS
- Hosted direct MCP verification: PASS
- MCP Inspector verification: PASS
- Hosted model-backed verification: PASS
- Final EC2 refresh: PASS
- Hosted-safe database verification: PASS
- Pull request: not created at the time of this report update
- Merge: not requested
- Final deployed commit: `3ac6c89da3f7d7675256c23cc65e257e4e10892b`

## Accepted scope

Phase 12 makes the accepted TypeScript MCP securely deployable to one EC2 instance. It preserves the deterministic commerce-operations workflow, the existing nine synthetic scenarios, and exactly these five tools:

1. `list_demo_cases`
2. `investigate_order_exception`
3. `create_human_review_escalation`
4. `get_review_case`
5. `get_investigation_trace`

No commerce mutation tool, user account, OAuth flow, new backend, new model-backed scenario, or trace frontend is introduced.

## Architecture

### Provider-independent path

```text
MCP Inspector or direct MCP client
  -> HTTPS /mcp with bearer API key
  -> deterministic workflow
  -> restricted PostgreSQL role
```

This path requires no `MODEL_API_KEY`.

### Model-backed interaction

```text
Trusted MCP-compatible AI host or client
  -> its configured model provider
  -> hosted HTTPS /mcp with bearer API key
  -> deterministic workflow
  -> restricted PostgreSQL role
```

There is no separate model-backed MCP URL. The hosted `/mcp` endpoint is the deterministic tool server. A model-backed experience is created when an MCP-compatible AI client connects to that endpoint and supplies its own model provider. The Gemini key remains on the trusted client and is not placed on EC2.

Hosting a separate model proxy or chat endpoint is outside Phase 12 because it would add provider credentials, cost controls, rate limiting, privacy boundaries, and another authentication surface.

## Authentication results

| Check                                    | Expected                        | Result |
| ---------------------------------------- | ------------------------------- | ------ |
| `GET /health` without token              | HTTP 200                        | PASS   |
| `/mcp` without Authorization             | HTTP 401 `MCP_AUTH_REQUIRED`    | PASS   |
| `/mcp` with malformed or incorrect token | HTTP 401 `MCP_AUTH_INVALID`     | PASS   |
| `/mcp` with correct bearer token         | MCP request continues           | PASS   |
| Invalid Host header                      | HTTP 403 `MCP_HOST_NOT_ALLOWED` | PASS   |
| Authenticated malformed JSON             | HTTP 400 `INVALID_JSON`         | PASS   |
| Production without `MCP_API_KEY`         | Startup configuration fails     | PASS   |

The token is compared through fixed-length SHA-256 digests with `timingSafeEqual`. The supplied and expected tokens are never logged or returned.

## Deployment configuration

- EC2 region: `ap-south-1`.
- Operating system: Ubuntu Server 24.04 LTS, x86_64.
- Instance class: `t3.small`.
- Root volume: 20 GB encrypted gp3.
- Elastic IP and GoDaddy `A` record configured for `commerce-mcp.ritikaxg.co.in`.
- `Dockerfile`: builds the existing API and generated Prisma client.
- `docker-compose.production.yml`: PostgreSQL, API, Caddy, plus an explicit one-off admin profile.
- `Caddyfile`: publishes only `/health` and `/mcp` through HTTP/HTTPS.
- Caddy obtained a public TLS certificate successfully.
- PostgreSQL data and Caddy state use named volumes.
- API and PostgreSQL ports are not published to the host.
- API receives only `WORKFLOW_DATABASE_URL` and `MCP_API_KEY` at runtime.
- API receives no owner, demo, or model-provider credential.
- Migrations, role creation, and synthetic seeding remain explicit admin operations.

## Reviewer request identifiers

The reviewer should call `list_demo_cases` before investigating an order.

For `investigate_order_exception`:

- `orderId`: choose a returned synthetic order ID.
- `clientRequestId`: generate a new UUID-based value for each new logical request.
- `idempotencyKey`: generate a new UUID-based value for each new investigation and reuse it only when retrying the exact same arguments.

For `create_human_review_escalation`, use the returned `investigationId`, generate a new escalation idempotency key, and reuse it only for retrying that same escalation.

Reusing an idempotency key with different arguments is rejected as `IDEMPOTENCY_KEY_REUSE`. Reusing a client request ID for another logical request is rejected as `CLIENT_REQUEST_ID_REUSE`.

## Hosted verifier results

### Provider-independent

Command:

```bash
bun --env-file=.env.local run verify:hosted:mcp
```

Result: PASS.

Verified:

- public health;
- authenticated MCP initialization;
- exact five-tool catalog and schema contract;
- nine-case synthetic catalog;
- accepted `ORD-1042` diagnosis and alternative warehouse;
- investigation-before-escalation ordering;
- review-case read;
- investigation-trace read;
- unknown-order safety;
- mutation-tool absence;
- `commerceStateChanged=false`;
- no model-provider key.

The provider-independent verifier was rerun after EC2 was refreshed to the final deployed commit and remained PASS.

### Model-backed

Command:

```bash
bun --env-file=.env.local run verify:hosted:ai
```

Result: PASS.

- Scenarios completed: 9 of 9.
- Sequential provider requests: true.
- Model calls: 18.
- Input tokens: 10,907.
- Output tokens: 969.
- Total tokens: 13,007.
- Duration: approximately 187 seconds.
- `commerceStateChanged=false`.
- `hostedMcpVerifiedBeforeProviderCalls=true`.

After the final EC2 refresh, a representative model-backed smoke test for `ORD-1042` also passed against the same hosted MCP endpoint. It returned the grounded out-of-stock diagnosis, identified eligible warehouse `WH-B`, recommended human review of reassignment, and reported that no commerce state was changed.

The model-backed verifier remains manual and is not a required CI check.

## Deployment evidence

| Field                        | Value                                                        |
| ---------------------------- | ------------------------------------------------------------ |
| Initial deployed commit SHA  | `6498a09647e0da90b7197a7becc1163c87c8cf85`                   |
| Final deployed commit SHA    | `3ac6c89da3f7d7675256c23cc65e257e4e10892b`                   |
| AWS region                   | `ap-south-1`                                                 |
| Deployment date              | 2026-08-01                                                   |
| Hosted health URL            | `https://commerce-mcp.ritikaxg.co.in/health`                 |
| Hosted MCP URL               | `https://commerce-mcp.ritikaxg.co.in/mcp`                    |
| Transport                    | Streamable HTTP                                              |
| Authentication               | `Authorization: Bearer <redacted>`                           |
| Last successful verification | 2026-08-01                                                   |
| Intended shutdown            | No earlier than 2026-08-09, or after client review completes |

EC2 was refreshed to the final CI-verified commit without resetting the persistent database. Migrations reported no pending changes, the API and PostgreSQL containers remained healthy, Caddy remained available, the runtime credential-boundary check returned exit code `0`, and the hosted-safe database verification completed with 3 passing tests and 0 failures.

## Verification evidence

| Evidence                                             | Result | Date       |
| ---------------------------------------------------- | ------ | ---------- |
| Phase 12 static and regression CI                    | PASS   | 2026-08-01 |
| Docker image build                                   | PASS   | 2026-08-01 |
| Local production Compose startup                     | PASS   | 2026-08-01 |
| Local production `/health`                           | PASS   | 2026-08-01 |
| Local authenticated `/mcp`                           | PASS   | 2026-08-01 |
| Local model-independent demo without `MODEL_API_KEY` | PASS   | 2026-08-01 |
| Final EC2 commit refresh                             | PASS   | 2026-08-01 |
| Hosted-safe database verification                    | PASS   | 2026-08-01 |
| Hosted provider-independent verifier                 | PASS   | 2026-08-01 |
| MCP Inspector                                        | PASS   | 2026-08-01 |
| Hosted nine-scenario AI verifier                     | PASS   | 2026-08-01 |
| Final model-backed `ORD-1042` smoke test             | PASS   | 2026-08-01 |
| `commerceStateChanged=false`                         | PASS   | 2026-08-01 |
| Runtime credential isolation                         | PASS   | 2026-08-01 |

Detailed redacted evidence:

- [Hosted direct MCP](phase-12-hosted-mcp/hosted-direct.md)
- [MCP Inspector](phase-12-hosted-mcp/mcp-inspector.md)
- [Hosted model-backed verification](phase-12-hosted-mcp/hosted-ai.md)
- [Hosted database verification boundary](phase-12-hosted-mcp/database-verification.md)

## Hosted database verification boundary

The original `db:verify-access` suite contains a Phase 4 clean-state invariant that expects the operations schema to be empty after its own transaction rolls back. That is correct for clean CI and initial deployment verification, but it is not rerunnable after hosted tool calls intentionally persist workflow evidence.

Phase 12 therefore adds:

```bash
bun run db:verify-access:hosted
```

The hosted-safe command preserves the role permission tests and compares commerce fingerprints and workflow counts before and after a rolled-back verification transaction. It must not delete or reset reviewer evidence.

Final hosted result:

```text
3 pass
0 fail
```

## Provider-failure behavior

A Gemini `RATE_LIMITED` or `QUOTA_EXHAUSTED` result belongs to the `MODEL_PROVIDER` boundary. It does not disable or invalidate:

- `GET /health`;
- direct MCP initialization;
- deterministic investigations;
- persisted review cases;
- trace retrieval.

The completed hosted AI run did not exhaust quota, but the accepted failure handling remains bounded and documented.

## Seven-day availability commitment

Keep the EC2 instance running through at least 2026-08-09 or until the client confirms review is complete. Retain `restart: unless-stopped`, monitor EC2 status checks, and use the documented health, status, log, and recovery commands. This is a scoped review-window commitment, not an SLA.

## Known limitations

- One EC2 instance and one PostgreSQL container are a deliberate submission-scope single point of failure.
- There is no automated failover or horizontal scaling.
- The bearer API key is one shared deployment credential; OAuth and user accounts are intentionally out of scope.
- Gemini free-tier or project quota may prevent a later model-backed demonstration while the deterministic hosted MCP remains available.
