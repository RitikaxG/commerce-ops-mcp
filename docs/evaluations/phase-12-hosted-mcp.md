# Phase 12 Hosted MCP Evaluation

## Final status

- Implementation branch: `phase/12-aws-hosted-mcp`
- Base: `main` containing accepted Phase 11
- Pull request: [#11](https://github.com/RitikaxG/commerce-ops-mcp/pull/11)
- Pull request state: merged
- Final Phase 12 branch head: `daa0a7e89ef0fc509b803c5c2c24b2602f801042`
- Merge commit: `c4fb3eed9aa6a9a14d42f33087f86099fe12382b`
- Final deployed application SHA: `3ac6c89da3f7d7675256c23cc65e257e4e10892b`
- Local production verification: PASS
- Phase 12 static and production Compose CI: PASS
- AWS deployment: PASS
- Hosted provider-independent MCP verification: PASS
- MCP Inspector verification: PASS
- Hosted nine-scenario model-backed verification: PASS
- Gemini CLI MCP-compatible client verification: PASS
- Final EC2 refresh: PASS
- Hosted-safe database verification: 3 pass, 0 fail

The deployed application SHA predates later documentation-only commits. Phase 12 packaging changes do not require an EC2 refresh.

## Accepted scope

Phase 12 deploys the accepted TypeScript MCP to one continuously available AWS EC2 instance. It preserves the deterministic commerce-operations workflow, the existing nine synthetic scenarios, and exactly these five tools:

1. `list_demo_cases`
2. `investigate_order_exception`
3. `create_human_review_escalation`
4. `get_review_case`
5. `get_investigation_trace`

No commerce mutation tool, user account, OAuth flow, new commerce backend, new scenario, frontend, or model proxy is introduced.

## Architecture

### Provider-independent path

```text
MCP Inspector or direct MCP client
  -> HTTPS /mcp with bearer API key
  -> deterministic workflow
  -> restricted PostgreSQL role
```

This path requires no model-provider credential.

### Model-backed path

```text
Trusted MCP-compatible AI client
  -> its configured model provider
  -> hosted HTTPS /mcp with bearer API key
  -> deterministic workflow
  -> restricted PostgreSQL role
```

There is no separate model-backed MCP URL. The hosted `/mcp` endpoint is the deterministic tool server. The client supplies its own model provider, while no Gemini key is installed on EC2.

Hosting a separate chat or model-proxy endpoint was excluded because it would add provider credentials, cost controls, privacy policy, rate limiting, and another authentication surface without improving the required MCP contract.

## Authentication results

| Check | Expected | Result |
| --- | --- | --- |
| `GET /health` without token | HTTP 200 | PASS |
| `/mcp` without Authorization | HTTP 401 `MCP_AUTH_REQUIRED` | PASS |
| `/mcp` with malformed or incorrect token | HTTP 401 `MCP_AUTH_INVALID` | PASS |
| `/mcp` with correct bearer token | MCP request continues | PASS |
| Invalid Host header | HTTP 403 `MCP_HOST_NOT_ALLOWED` | PASS |
| Authenticated malformed JSON | HTTP 400 `INVALID_JSON` | PASS |
| Production without `MCP_API_KEY` | Startup configuration fails | PASS |

The expected and supplied token values are hashed before fixed-length comparison and are never logged or returned.

## Deployment configuration

- AWS region: `ap-south-1`.
- Operating system: Ubuntu Server 24.04 LTS, x86_64.
- Instance class: `t3.small`.
- Root volume: 20 GB encrypted gp3.
- Elastic IP and GoDaddy DNS for `commerce-mcp.ritikaxg.co.in`.
- `Dockerfile`: builds the existing TypeScript API and Prisma client.
- `docker-compose.production.yml`: PostgreSQL, API, Caddy, and an explicit disabled-by-default admin profile.
- `Caddyfile`: terminates HTTPS and publishes only `/health` and `/mcp`.
- API and PostgreSQL ports remain internal.
- PostgreSQL and Caddy state use persistent named volumes.
- The API receives `WORKFLOW_DATABASE_URL` and `MCP_API_KEY` only.
- The API receives no schema-owner, demo, or model-provider credential.
- Migrations, role setup, access verification, and synthetic seeding remain explicit administrative operations.

## Reviewer identifiers

Call `list_demo_cases` before investigating an order.

For `investigate_order_exception`:

- `orderId`: choose a returned synthetic order ID.
- `clientRequestId`: generate a new UUID-based value for each new logical request.
- `idempotencyKey`: generate a new UUID-based value for each new investigation.
- Reuse both values only when retrying the exact same request and arguments.

For `create_human_review_escalation`, use the returned `investigationId`, generate a new escalation idempotency key, and reuse that key only for an exact retry.

Reusing an idempotency key with different arguments returns `IDEMPOTENCY_KEY_REUSE`. Reusing a client request ID for a different logical investigation returns `CLIENT_REQUEST_ID_REUSE`.

The complete external instructions are in [Reviewer guide](../reviewer-guide.md).

## Hosted provider-independent verification

Command:

```bash
bun --env-file=.env.local run verify:hosted:mcp
```

Result: **PASS**.

Verified:

- public health;
- authenticated MCP initialization;
- exact five-tool catalog and accepted schemas;
- nine-case synthetic catalog;
- accepted `ORD-1042` diagnosis and alternative warehouse;
- investigation-before-escalation ordering;
- review-case and trace reads;
- unknown-order safety;
- mutation-tool absence;
- `commerceStateChanged=false`;
- no model-provider dependency.

## Hosted model-backed verification

Command:

```bash
bun --env-file=.env.local run verify:hosted:ai
```

Result: **PASS**.

- Approved scenarios completed: 9 of 9.
- Provider requests were sequential: true.
- Model calls: 18.
- Input tokens: 10,907.
- Output tokens: 969.
- Total tokens: 13,007.
- Duration: approximately 187 seconds.
- `commerceStateChanged=false`.
- `hostedMcpVerifiedBeforeProviderCalls=true`.

The provider-backed verifier remains manual and is not a required deterministic CI check.

## MCP Inspector verification

Result: **PASS**.

Inspector connected to the public Streamable HTTP endpoint with the private bearer token, discovered exactly five tools, investigated `ORD-1042`, created a human-review escalation, read the review case, and retrieved the persisted trace.

Evidence:

- [Inspector report](phase-12-hosted-mcp/mcp-inspector.md)
- [Inspector connection screenshot](../evidence/final-submission/01-inspector-connection.png)
- [Inspector tool screenshot](../evidence/final-submission/02-inspector-five-tools.png)
- [Inspector trace screenshot](../evidence/final-submission/03-inspector-trace.png)

## Gemini CLI independent-client verification

Result: **PASS**.

Gemini CLI v0.53.1 connected to the same hosted `/mcp` endpoint as an independent MCP-compatible AI client. Its `/mcp` view showed `commerce-ops-hosted - Ready (5 tools)`. The model selected `list_demo_cases` followed by `investigate_order_exception`, generated fresh UUID-based identifiers, and returned the grounded `ORD-1042` result:

```text
diagnosis: ASSIGNED_WAREHOUSE_OUT_OF_STOCK
assigned warehouse: WH-A
eligible alternative: WH-B
queue: FULFILMENT_OPERATIONS
next step: human review of reassignment
commerceStateChanged: false
```

Evidence:

- [Hosted AI evidence](phase-12-hosted-mcp/hosted-ai.md)
- [Gemini MCP-ready screenshot](../evidence/final-submission/04-gemini-mcp-ready.png)
- [Gemini tool-execution screenshot](../evidence/final-submission/05-gemini-tool-execution.png)
- [Gemini grounded-result screenshot](../evidence/final-submission/06-gemini-grounded-result.png)

## Hosted-safe database verification

The original `db:verify-access` suite contains a correct clean-state invariant for disposable CI. It expects the operations schema to be empty after its own transaction rolls back. A hosted deployment contains legitimate persisted reviewer evidence, so resetting or asserting an empty schema would be unsafe.

Phase 12 adds:

```bash
bun run db:verify-access:hosted
```

The hosted-safe command compares commerce fingerprints and workflow counts before and after a rolled-back permission-verification transaction. It never deletes reviewer evidence.

Final hosted result:

```text
3 pass
0 fail
```

## Final verification matrix

| Evidence | Result | Date |
| --- | --- | --- |
| Phase 12 static and regression CI | PASS | 2026-08-01 |
| Docker image build | PASS | 2026-08-01 |
| Local production Compose startup | PASS | 2026-08-01 |
| Final EC2 commit refresh | PASS | 2026-08-01 |
| Hosted-safe database verification | PASS | 2026-08-01 |
| Hosted provider-independent verifier | PASS | 2026-08-01 |
| MCP Inspector | PASS | 2026-08-01 |
| Hosted nine-scenario AI verifier | PASS | 2026-08-01 |
| Gemini CLI independent compatible client | PASS | 2026-08-01 |
| Runtime credential isolation | PASS | 2026-08-01 |
| `commerceStateChanged=false` | PASS | 2026-08-01 |

Full evidence:

- [Final evaluation](../final-evaluation.md)
- [Final evidence index](../evidence/final-submission/README.md)
- [Hosted verification PDF](../evidence/final-submission/00-hosted-mcp-verification-report.pdf)
- [Hosted direct MCP](phase-12-hosted-mcp/hosted-direct.md)
- [MCP Inspector](phase-12-hosted-mcp/mcp-inspector.md)
- [Hosted model-backed and Gemini CLI](phase-12-hosted-mcp/hosted-ai.md)
- [Hosted database boundary](phase-12-hosted-mcp/database-verification.md)

## Known limitations

- One EC2 instance and one PostgreSQL container are a deliberate submission-scope single point of failure.
- There is no automated failover or horizontal scaling.
- The shared bearer key is a review credential, not a multi-user identity system.
- Gemini quota or rate limits may prevent a later model-backed demonstration while direct MCP remains available.
- Existing investigation evidence is immutable; changed source evidence requires a new investigation.
- The product exposes no commerce mutation capability and no frontend.

## Availability window

Keep the EC2 instance running through at least 9 August 2026 or until the client confirms review is complete. This is a bounded review-window commitment, not an SLA.
