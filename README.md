# AI-First Commerce Operations Investigator

This repository implements a bounded operations workflow that explains why a paid order has not reached shipment creation and can create a persistent human-review escalation.

## Current state

Phases 0 through 11 are complete and merged into `main`. Phase 11 provides the accepted provider-neutral AI host, Gemini integration, serialized requests, bounded retries, safe `RATE_LIMITED` and `QUOTA_EXHAUSTED` failures, and model-backed verification across the existing nine synthetic scenarios.

Phase 12 is implemented on `phase/12-aws-hosted-mcp` and is awaiting branch verification and repository-owner approval for AWS deployment. It adds production bearer authentication for `/mcp`, provider-independent and model-backed hosted verification modes, a one-instance Docker Compose deployment for EC2, Caddy HTTPS termination, explicit database credential boundaries, and deployment/evidence documentation.

The deterministic workflow remains authoritative for evidence readiness, diagnosis, escalation policy, persistence, and audit behavior. Gemini selects approved tools and explains validated server results; it never calculates or changes the diagnosis, queue, next step, or commerce state.

**The model provider is used only for natural-language interaction and tool selection. The hosted MCP server and deterministic workflow remain available through MCP Inspector or a direct MCP client when the model provider is temporarily unavailable.**

Local prerequisites are Bun 1.3.2 and Node.js 20.9.0 or newer. Docker Engine and Docker Compose are required for production-stack verification.

## Product boundary

The MCP exposes exactly five tools:

1. `list_demo_cases`
2. `investigate_order_exception`
3. `create_human_review_escalation`
4. `get_review_case`
5. `get_investigation_trace`

The workflow contains exactly the nine approved synthetic orders `ORD-1042` through `ORD-1050`. It provides no commerce-state mutation tool, user account, OAuth flow, database reset tool, owner cleanup tool, or browser-side provider integration.

## Phase 12 architecture

### Demo A: provider-independent MCP

```text
MCP Inspector or direct MCP client
  -> HTTPS /mcp with bearer API key
  -> deterministic workflow
  -> restricted PostgreSQL role
```

This path does not require `MODEL_API_KEY`.

### Demo B: model-backed interaction

```text
Trusted local MCP-compatible AI client
  -> Gemini
  -> HTTPS /mcp with bearer API key
  -> deterministic workflow
  -> restricted PostgreSQL role
```

The Gemini key remains on the trusted local client and is not installed on EC2.

## Authentication behavior

`GET /health` remains unauthenticated.

`/mcp` preserves Host-header validation and then requires:

```text
Authorization: Bearer <MCP_API_KEY>
```

Stable failures:

- missing header: HTTP 401 with `MCP_AUTH_REQUIRED`;
- malformed or incorrect bearer token: HTTP 401 with `MCP_AUTH_INVALID`;
- disallowed Host header: HTTP 403 with `MCP_HOST_NOT_ALLOWED`;
- authenticated malformed JSON: HTTP 400 with `INVALID_JSON`.

Production configuration fails at startup when `MCP_ALLOWED_HOSTS` or `MCP_API_KEY` is absent. Tokens are not logged or returned.

## Environment boundaries

### Hosted API runtime only

```text
NODE_ENV=production
PORT=3000
MCP_ALLOWED_HOSTS=commerce-mcp.ritikaxg.co.in
MCP_API_KEY=<generated bearer key>
WORKFLOW_DATABASE_URL=<restricted commerce_workflow connection>
```

### Explicit migration and seed operations only

```text
DATABASE_URL=<schema-owner connection>
DEMO_DATABASE_URL=<commerce_demo connection>
WORKFLOW_DATABASE_URL=<restricted commerce_workflow connection>
```

The API container does not receive `DATABASE_URL`, `DEMO_DATABASE_URL`, or `MODEL_API_KEY`.

Generate an API key locally or on EC2 without sharing it:

```bash
openssl rand -base64 48
```

Local environment files are ignored. Verify before creating `.env.local`:

```bash
git check-ignore -v .env.local
```

## Phase 12 local verification

Install and run the ordinary repository checks:

```bash
bun install --frozen-lockfile
bun run db:generate
bun run build
bun run typecheck
bun run test
bun run lint
```

With the accepted local PostgreSQL role configuration:

```bash
bun run db:migrate
bun run db:setup-access
bun run db:reset-demo
bun run db:verify-demo
bun run db:verify-access
bun run eval:mcp:direct
```

Build the production image and run the production Compose stack using protected runtime/admin environment files:

```bash
docker build -t commerce-ops-mcp-api:phase12 .
docker compose --env-file .env.compose -f docker-compose.production.yml up -d postgres
docker compose --env-file .env.compose -f docker-compose.production.yml \
  --profile admin run --rm admin bun run db:migrate
docker compose --env-file .env.compose -f docker-compose.production.yml \
  --profile admin run --rm admin bun run db:setup-access
docker compose --env-file .env.compose -f docker-compose.production.yml \
  --profile admin run --rm admin bun run db:seed
docker compose --env-file .env.compose -f docker-compose.production.yml \
  up -d api caddy
```

The API and PostgreSQL ports are internal only. Caddy publishes ports 80 and 443.

## Hosted provider-independent verification

Create an ignored local `.env.local` containing:

```text
MCP_SERVER_URL=https://commerce-mcp.ritikaxg.co.in/mcp
MCP_AUTH_BEARER_TOKEN=<same value as hosted MCP_API_KEY>
```

Run:

```bash
bun --env-file=.env.local run verify:hosted:mcp
```

The verifier connects to an already-running endpoint and does not start a local API. It checks:

- public `/health`;
- authenticated MCP initialization;
- exactly five tools and their accepted schemas;
- the nine-case catalog;
- the accepted `ORD-1042` investigation;
- escalation only after investigation;
- review-case and trace retrieval;
- safe unknown-order behavior;
- absence of mutation tools;
- `commerceStateChanged=false`.

It does not read or require `MODEL_API_KEY`.

## Hosted model-backed verification

Add the existing provider configuration and a rotated Gemini key to the trusted local `.env.local`:

```text
MODEL_PROVIDER=gemini
MODEL_NAME=gemini-3.6-flash
MODEL_API_KEY=<rotated local-only key>
AGENT_PROVIDER_MIN_INTERVAL_MS=3500
AGENT_PROVIDER_MAX_RETRIES=2
AGENT_PROVIDER_MAX_RETRY_DELAY_MS=60000
AGENT_PROVIDER_TIMEOUT_MS=30000
AGENT_MCP_TIMEOUT_MS=15000
```

Run the focused nine-scenario suite:

```bash
bun --env-file=.env.local run verify:hosted:ai
```

This mode verifies the hosted MCP health and exact tool catalog before provider calls. It preserves sequential Gemini requests, bounded retries, deterministic scenario expectations, and `commerceStateChanged=false`. Provider quota failures are labeled `MODEL_PROVIDER`; they are not reported as MCP unavailability. This live command is manual and is not a required CI check.

## MCP Inspector

Launch the current Inspector release from a trusted local machine:

```bash
npx @modelcontextprotocol/inspector@latest
```

Select Streamable HTTP, enter the hosted `/mcp` URL, and provide the bearer token through the Inspector token/header control. Demonstrate tool discovery, `ORD-1042`, escalation, review retrieval, and trace retrieval. Do not include the token control in evidence screenshots.

## Production deployment

The scoped production stack contains:

- `postgres`: PostgreSQL 16 with a persistent named volume and health check;
- `api`: the existing TypeScript MCP API with restricted runtime credentials;
- `caddy`: automatic HTTPS and the only published ports;
- `admin`: a disabled-by-default Compose profile for explicit migrations, role setup, and seeding.

Deployment and operations guide:

- [AWS EC2 deployment](docs/deployment/aws-ec2.md)
- [Phase 12 evaluation report](docs/evaluations/phase-12-hosted-mcp.md)
- [Hosted evidence guide](docs/evaluations/phase-12-hosted-mcp/README.md)

The target is Ubuntu 24.04 LTS, `t3.small`, 20 GB gp3, an Elastic IP, and `ap-south-1` unless the repository owner chooses another region. No AWS access keys are required by the application.

## Plan and architecture references

- [Final plan](docs/plans/Diligence_AI_Commerce_Operations_Final_Plan_Updated.pdf)
- [Workflow contract](docs/workflow-contract.md)
- [Package graph](docs/architecture/package-graph.md)
- [Approved PostgreSQL schema](docs/database/schema-proposal.md)
- [Schema acceptance summary](docs/database/client-review-summary.md)
- [Approved synthetic scenarios](docs/scenarios/approved-synthetic-scenarios.md)
- [Coding-agent instructions](AGENTS.md)

## Implementation status

| Phase | Status | Main output | Evaluation |
| --- | --- | --- | --- |
| 0 | Complete | Workflow contract and repository rules | [Report](docs/evaluations/phase-00.md) |
| 1 | Complete | Approved PostgreSQL schema | [Report](docs/evaluations/phase-01.md) |
| 2 | Complete | Bun and Turborepo foundation | [Report](docs/evaluations/phase-02.md) |
| 3 | Complete | Approved scenarios and PostgreSQL seed/reset | [Report](docs/evaluations/phase-03-synthetic-scenarios.md) |
| 4 | Complete | Roles, grants, immutable records and invariants | [Report](docs/evaluations/phase-04-database-hardening.md) |
| 5 | Complete | Read-only commerce repositories | [Report](docs/evaluations/phase-05-readonly-commerce-repositories.md) |
| 6 | Complete | Evidence collection and normalization | [Report](docs/evaluations/phase-06-evidence-collector.md) |
| 7 | Complete | Evidence readiness and conflict gate | [Report](docs/evaluations/phase-07-evidence-readiness.md) |
| 8 | Complete | Deterministic diagnosis and suggested action | [Report](docs/evaluations/phase-08-diagnosis-engine.md) |
| 9 | Complete | Persistent investigation and escalation workflow | [Report](docs/evaluations/phase-09-persistence-escalation.md) |
| 10 | Complete | Remote MCP server and direct tool evaluation | [Report](docs/evaluations/phase-10-remote-mcp.md) |
| 11 | Complete | Gemini AI host and model-backed MCP evaluation | [Report](docs/evaluations/phase-11-gemini-ai-host.md) |
| 12 | Awaiting branch verification and AWS approval | Bearer-protected hosted MCP and EC2 deployment | [Report](docs/evaluations/phase-12-hosted-mcp.md) |

## Existing regression commands

```bash
bun install --frozen-lockfile
bun run --filter @repo/mcp test
bun run --filter @repo/api test
bun run --filter @repo/agent test
bun run --filter @repo/evaluations test
bun run build
bun run typecheck
bun run eval:mcp:direct
bun run db:verify-demo
```

The direct evaluator builds and starts the real Express API locally, connects with the official MCP client over Streamable HTTP, executes all nine scenarios, verifies escalation and idempotency behavior, checks forbidden tools and invalid inputs, proves commerce remains unchanged, and clears operations demo rows in `finally`.

## Availability window

After owner-approved deployment, record the deployment timestamp, intended shutdown timestamp, region, commit SHA, hosted URLs, and last verification timestamp in the Phase 12 report. Keep the EC2 instance and containers running for at least seven complete days after submission. The repository documents a scoped review window and does not promise an SLA.
