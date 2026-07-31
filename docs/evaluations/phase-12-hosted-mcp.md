# Phase 12 hosted MCP evaluation

## Status

- Implementation branch: `phase/12-aws-hosted-mcp`
- Base: merged `main` containing Phase 11
- Local/static verification: pending Phase 12 branch CI
- AWS deployment: not started; requires repository-owner approval
- Hosted direct MCP verification: pending deployment
- MCP Inspector verification: pending deployment
- Hosted model-backed verification: pending deployment and a rotated local Gemini key
- Pull request: not created
- Merge: not requested

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

### Model-backed path

```text
Trusted local AI host / MCP-compatible client
  -> Gemini
  -> hosted HTTPS /mcp with bearer API key
  -> deterministic workflow
  -> restricted PostgreSQL role
```

The Gemini key remains on the trusted client and is not placed on EC2.

## Authentication results

| Check | Expected | Result |
| --- | --- | --- |
| `GET /health` without token | HTTP 200 | Pending CI |
| `/mcp` without Authorization | HTTP 401 `MCP_AUTH_REQUIRED` | Pending CI |
| `/mcp` with malformed or incorrect token | HTTP 401 `MCP_AUTH_INVALID` | Pending CI |
| `/mcp` with correct bearer token | MCP request continues | Pending CI |
| Invalid Host header | HTTP 403 `MCP_HOST_NOT_ALLOWED` | Pending CI |
| Authenticated malformed JSON | HTTP 400 `INVALID_JSON` | Pending CI |
| Production without `MCP_API_KEY` | Startup configuration fails | Pending CI |

The token is compared through fixed-length SHA-256 digests with `timingSafeEqual`. The supplied and expected tokens are never logged or returned.

## Deployment configuration

- `Dockerfile`: builds the existing API and generated Prisma client.
- `docker-compose.production.yml`: PostgreSQL, API, Caddy, plus an explicit one-off admin profile.
- `Caddyfile`: publishes only `/health` and `/mcp` through HTTP/HTTPS.
- PostgreSQL data and Caddy state use named volumes.
- API and PostgreSQL ports are not published to the host.
- API receives only `WORKFLOW_DATABASE_URL` at runtime.
- Migrations, role creation, and synthetic seeding are explicit admin operations.

## Hosted verifier contracts

### Provider-independent

```bash
bun --env-file=.env.local run verify:hosted:mcp
```

Expected coverage:

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

### Model-backed

```bash
bun --env-file=.env.local run verify:hosted:ai
```

Expected coverage:

- hosted MCP health and exact tool discovery before provider calls;
- the existing nine approved natural-language investigations only;
- serialized provider requests and bounded retries;
- exact deterministic scenario expectations;
- `commerceStateChanged=false`;
- distinct `HOSTED_MCP` and `MODEL_PROVIDER` failure boundaries;
- explicit `RATE_LIMITED` and `QUOTA_EXHAUSTED` provider failures.

The model-backed verifier is manual and is not a required CI check.

## Deployment evidence

Complete after repository-owner approval and AWS deployment.

| Field | Value |
| --- | --- |
| Deployed commit SHA | Pending |
| AWS region | Pending; planned `ap-south-1` |
| Deployment timestamp | Pending |
| Hosted health URL | `https://commerce-mcp.ritikaxg.co.in/health` |
| Hosted MCP URL | `https://commerce-mcp.ritikaxg.co.in/mcp` |
| Transport | Streamable HTTP |
| Authentication | `Authorization: Bearer <redacted>` |
| Last verification timestamp | Pending |
| Intended shutdown timestamp | Pending; at least seven complete days after submission |

## Verification evidence

| Evidence | Result | Timestamp |
| --- | --- | --- |
| Phase 12 static and regression CI | Pending | Pending |
| Docker image build | Pending | Pending |
| Local production Compose startup | Pending | Pending |
| Local production `/health` | Pending | Pending |
| Local authenticated `/mcp` | Pending | Pending |
| Local model-independent demo without `MODEL_API_KEY` | Pending | Pending |
| Hosted provider-independent verifier | Pending | Pending |
| MCP Inspector | Pending | Pending |
| Hosted nine-scenario AI verifier | Pending | Pending |
| MCP-compatible AI-client representative run | Pending | Pending |
| `commerceStateChanged=false` | Pending | Pending |

## Provider-failure behavior

A Gemini `RATE_LIMITED` or `QUOTA_EXHAUSTED` result belongs to the `MODEL_PROVIDER` boundary. It does not disable or invalidate:

- `GET /health`;
- direct MCP initialization;
- deterministic investigations;
- persisted review cases;
- trace retrieval.

After a provider failure, rerun `verify:hosted:mcp` without `MODEL_API_KEY` to record that the MCP remains independently usable.

## Seven-day availability commitment

After submission, record the deployment timestamp and an intended shutdown timestamp at least seven complete days later. Keep the EC2 instance running, retain `restart: unless-stopped`, monitor EC2 status checks, and use the documented health, status, log, and recovery commands. This is a scoped review-window commitment, not an SLA.

## Known limitations

- One EC2 instance and one PostgreSQL container are a deliberate submission-scope single point of failure.
- There is no automated failover or horizontal scaling.
- The bearer API key is one shared deployment credential; OAuth and user accounts are intentionally out of scope.
- Gemini free-tier or project quota may prevent the model-backed demonstration while the deterministic hosted MCP remains available.
- Hosted, Inspector, and AI-client results cannot be recorded until the repository owner approves AWS and DNS changes.
