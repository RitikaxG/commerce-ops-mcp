# Post-Phase 11 Protected Staging MCP Handoff

## Purpose

After the local Gemini AI-host evaluation passes, deploy the already-tested MCP server to a protected HTTPS staging URL and repeat both protocol-level and model-backed evaluation against that hosted endpoint.

The deployment sequence is:

```text
Phase 11 local Gemini evaluation
        ↓
protected staging MCP deployment
        ↓
hosted MCP Inspector and Gemini-host evaluation
        ↓
Phase 12 read-only trace API and viewer
        ↓
Phase 13 final authentication, deployment hardening, and submission
```

Phase 11 does not make the endpoint public.

## Client configuration boundary

The AI host is transport-configurable and requires no code changes when moving from local to hosted MCP.

Local:

```text
MCP_SERVER_URL=http://127.0.0.1:3000/mcp
MCP_AUTH_BEARER_TOKEN=
```

Protected staging:

```text
MCP_SERVER_URL=https://<staging-host>/mcp
MCP_AUTH_BEARER_TOKEN=<server-issued-secret>
```

`MODEL_API_KEY` remains server-side in the AI-host process. It must never be sent to the MCP server, browser, trace response, Inspector screenshot, or client documentation.

## Required staging controls

The staging deployment must provide:

- HTTPS;
- authentication beyond Host-header validation;
- an explicit production `MCP_ALLOWED_HOSTS` value;
- the restricted `WORKFLOW_DATABASE_URL` at runtime;
- schema-owner and demo credentials available only to migration or explicit seed/reset jobs;
- no wildcard Host allowance;
- environment secrets managed by the provider;
- `GET /health` for deployment health checks;
- logs that omit prompts, complete tool outputs, credentials, database URLs, idempotency keys, and provider payloads;
- no browser-side Gemini call;
- no commerce mutation capability.

API-key or bearer-token authentication is acceptable for staging when the client confirms it. Final production authentication or OAuth expectations remain Phase 13 hardening work.

## Hosted database preparation

1. Provision PostgreSQL.
2. Apply the accepted Prisma migrations with `DATABASE_URL`.
3. Create the demo and workflow roles through the accepted access-control script.
4. Seed the nine approved synthetic scenarios through `DEMO_DATABASE_URL` only.
5. Configure the deployed API with `WORKFLOW_DATABASE_URL` only.
6. Verify that the workflow role can read `commerce`, write only approved `operations` records, and cannot mutate commerce.

Do not run demo seed/reset or workflow cleanup from application startup.

## Hosted MCP verification

Connect MCP Inspector using Streamable HTTP:

```text
https://<staging-host>/mcp
```

Provide the staging bearer token through the Inspector's authorization-header configuration.

Verify exactly five tools:

```text
list_demo_cases
investigate_order_exception
create_human_review_escalation
get_review_case
get_investigation_trace
```

Run `ORD-1042` and verify:

```text
diagnosisCode = ASSIGNED_WAREHOUSE_OUT_OF_STOCK
eligibleAlternativeWarehouseIds = ["WH-B"]
suggestedQueue = FULFILMENT_OPERATIONS
commerceStateChanged = false
```

Then explicitly create and read the review case and investigation trace.

## Hosted AI-host verification

The Phase 11 evaluator currently starts a local API for isolated verification. Before staging execution, add or use a mode that accepts the configured hosted `MCP_SERVER_URL` without spawning the local API.

Repeat:

- model availability smoke check;
- all nine natural-language investigations;
- eligible and non-actionable escalation ordering;
- missing-ID and unknown-order behavior;
- mutation refusal;
- user and tool-result prompt-injection checks;
- three-run stability checks;
- commerce before/after verification where deployment access permits;
- final explicit workflow cleanup through an owner-only deployment job, never through runtime credentials.

## Client handoff fields

The staging client package should include:

```text
Hosted MCP URL
Transport: Streamable HTTP
Authentication header instructions
Five tool names and side effects
Nine synthetic order IDs
ORD-1042 example request and expected result
MCP Inspector steps
Gemini AI-host example
Health-check URL
Demo reset policy
Known limitations
```

## Phase 12 and Phase 13 boundary

Phase 12 adds only a read-only trace API and minimal viewer. Browser code must use HTTP and must never connect directly to PostgreSQL or Gemini.

Phase 13 finalizes authentication, provider deployment configuration, client-ready hosted evidence, operational logging, secret rotation, final documentation, and submission hardening.
