# Final Evaluation Report

## Decision

**PASS - the hosted TypeScript MCP and bounded commerce-operations workflow are ready for asynchronous client review.**

The implementation was verified through automated protocol and database checks, MCP Inspector, a hosted model-backed evaluator, and Gemini CLI as an independent MCP-compatible AI client. Every tested path preserved the read-only commerce boundary and reported `commerceStateChanged=false`.

## Final identifiers

| Field | Value |
| --- | --- |
| Hosted health | `https://commerce-mcp.ritikaxg.co.in/health` |
| Hosted MCP | `https://commerce-mcp.ritikaxg.co.in/mcp` |
| Transport | Streamable HTTP |
| Authentication | Shared reviewer bearer token supplied privately |
| AWS region | `ap-south-1` |
| Deployment date | 1 August 2026 |
| Final deployed application SHA | `3ac6c89da3f7d7675256c23cc65e257e4e10892b` |
| Final Phase 12 branch head | `daa0a7e89ef0fc509b803c5c2c24b2602f801042` |
| Phase 12 merge commit | `c4fb3eed9aa6a9a14d42f33087f86099fe12382b` |
| Phase 12 pull request | `#11`, merged |

The deployed application SHA predates the later documentation-only commits. Final submission packaging does not require an EC2 refresh.

## Scope verified

- public health and authenticated `/mcp` endpoints;
- exact discovery of the five approved tools and schemas;
- all nine approved synthetic scenarios;
- complete, missing, and conflicting evidence behavior;
- deterministic diagnosis and queue selection;
- persistent investigations and immutable evidence snapshots;
- explicit human-review escalation;
- review-case and trace retrieval;
- investigation and escalation idempotency;
- safe unknown-order, missing-ID, malformed-input, and forbidden-tool failures;
- Host validation and bearer authentication;
- absence of commerce mutation tools;
- database role isolation and commerce immutability;
- model-backed tool selection and grounded explanation;
- provider failures remaining separate from MCP availability.

## Verification results

| Verification | Result | Observed evidence |
| --- | --- | --- |
| Static and regression CI | PASS | Build, strict typecheck, tests, lint, DB checks, direct MCP checks, production Compose checks |
| Direct MCP evaluation | PASS | Five tools, nine investigations, seven eligible review cases, 17 idempotency records, cleanup |
| Approved synthetic scenarios | 9/9 PASS | Expected evidence status, diagnosis, escalation decision, and queue |
| Hosted provider-independent verifier | PASS | Health, authentication, discovery, workflow, reads, safe failures |
| Hosted model-backed verifier | 9/9 PASS | Sequential requests, 18 model calls, 13,007 total tokens, approximately 187 seconds |
| MCP Inspector | PASS | Hosted connection, exact five tools, investigation, escalation, case and trace reads |
| Gemini CLI compatible client | PASS | Model-selected hosted tools and grounded `ORD-1042` explanation |
| Hosted-safe DB verification | 3 pass, 0 fail | Existing hosted evidence preserved |
| Runtime credential isolation | PASS | No owner, demo, or model-provider credential in the API container |
| Commerce state comparison | PASS | No commerce fixture mutation; `commerceStateChanged=false` |

## Representative result

For `ORD-1042`, the hosted workflow returned:

```text
investigation status: COMPLETED
evidence status: COMPLETE
diagnosis: ASSIGNED_WAREHOUSE_OUT_OF_STOCK
assigned warehouse: WH-A
required quantity: 1
available quantity: 0
eligible alternative warehouse: WH-B
suggested queue: FULFILMENT_OPERATIONS
next step: review reassignment to an eligible warehouse
commerceStateChanged: false
```

The workflow did not reassign inventory, release a hold, retry fulfilment, create a shipment, or claim that any such action occurred.

## Verification layers

1. **Unit and package tests** validate schemas, repositories, evidence normalization, readiness, deterministic diagnosis, workflow orchestration, MCP adapters, AI-host policy, grounding, and safe failures.
2. **Database access and invariant tests** prove runtime commerce `SELECT` only and scoped workflow writes.
3. **Direct MCP evaluation** uses the official client and real Express `/mcp` route without a model dependency.
4. **Hosted provider-independent verification** validates the already-running HTTPS deployment and bearer boundary.
5. **MCP Inspector** provides independent manual protocol and tool evidence.
6. **Hosted model-backed evaluation** runs all nine natural-language scenarios through Gemini and the hosted MCP.
7. **Gemini CLI** demonstrates a separate MCP-compatible AI client discovering and selecting the hosted tools.

## Visual evidence

### Authenticated remote MCP configuration

![MCP Inspector configured with the remote authenticated server](../images/include-header-in-server-settings.png)

### Exact five-tool surface

![MCP Inspector exact tool catalog](../images/all-tools-rendered.png)

### End-to-end hosted investigation

![MCP Inspector investigation request](../images/investigate-an-order.png)

![MCP Inspector grounded investigation result](../images/investigation-result.png)

### Automated hosted model-backed evaluation

![Hosted model-backed evaluation result](../images/model-backed-evaluation.png)

### Independent MCP-compatible AI client

![Gemini CLI using the hosted MCP to answer ORD-1042](../images/gemini-client-using-mcp-to-respond.png)

[Download the concise Hosted MCP Verification Report](evidence/final-submission/00-hosted-mcp-verification-report.pdf).

The complete evidence index is available in [Final submission evidence](evidence/final-submission/README.md).

## Known limitations

- One EC2 instance and one PostgreSQL container are a deliberate review-scope single point of failure.
- The shared bearer token provides deployment access, not individual user identity.
- The model provider may be slow or unavailable because of quota, rate limits, or cost controls.
- Evidence snapshots are immutable; changed source evidence requires a new investigation.
- The dataset is synthetic and fixed for repeatable evaluation.
- The product recommends human action but exposes no commerce mutation capability.
- There is no frontend; review occurs through MCP Inspector and compatible AI clients.

## Submission status

- [x] Hosted MCP URL
- [x] Source repository
- [x] Concise README and reviewer instructions
- [x] Product decisions, assumptions, and exclusions
- [x] Focused tests and runtime verification
- [x] MCP Inspector verification
- [x] MCP-compatible AI-client verification
- [x] AI worklog
- [x] Redacted evidence and verification report
- [ ] Four-to-five-minute asynchronous demo video
