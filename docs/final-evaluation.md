# Final Evaluation Report

## Decision

**PASS - the hosted TypeScript MCP and the bounded commerce-operations workflow are ready for asynchronous client review.**

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

The deployed application SHA predates later documentation-only commits. No documentation packaging change requires an EC2 refresh.

## Scope verified

The final verification covers:

- the public health endpoint and authenticated `/mcp` endpoint;
- exact discovery of the five approved tools and their accepted schemas;
- all nine approved synthetic scenarios;
- complete, missing, and conflicting evidence behavior;
- deterministic diagnosis and queue selection;
- persistent investigations and immutable evidence snapshots;
- explicit human-review escalation;
- review-case and trace retrieval;
- investigation and escalation idempotency;
- safe unknown-order, missing-ID, malformed-input, and forbidden-tool failures;
- Host validation and bearer authentication failures;
- absence of commerce mutation tools;
- database role isolation and commerce immutability;
- model-backed tool selection and grounded explanation;
- provider-rate-limit and quota errors remaining separate from MCP availability.

## Verification results

| Verification | Result | Observed evidence |
| --- | --- | --- |
| Repository static and regression CI | PASS | Build, strict typecheck, tests, lint, DB checks, direct MCP checks, production Compose checks |
| Direct MCP evaluation | PASS | Five tools, nine investigations, seven eligible review cases, 17 idempotency records, final cleanup |
| Approved synthetic scenarios | 9/9 PASS | Expected evidence status, diagnosis, escalation decision, and queue |
| Hosted provider-independent verifier | PASS | Public health, authenticated MCP initialization, tools, schemas, workflow, reads, safe failures |
| Hosted model-backed verifier | 9/9 PASS | Sequential requests, 18 model calls, 13,007 total tokens, approximately 187 seconds |
| MCP Inspector | PASS | Hosted connection, exact five tools, investigation, escalation, case read, trace read |
| Gemini CLI compatible client | PASS | `/mcp` ready with five tools, model-selected calls, grounded `ORD-1042` explanation |
| Hosted-safe DB verification | 3 pass, 0 fail | Existing hosted workflow evidence preserved before and after the rolled-back check |
| Runtime credential isolation | PASS | API has workflow DB and MCP token only; no owner, demo, or model-provider credential |
| Commerce state comparison | PASS | `commerceStateChanged=false` and no commerce fixture mutation |

## Representative workflow result

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

## Verification layers and their purpose

### 1. Unit and package tests

Verify strict schemas, repository behavior, evidence normalization, readiness rules, deterministic diagnosis, workflow orchestration, MCP adapters, AI-host policies, provider mapping, grounding checks, and safe failures.

### 2. Database access and invariant tests

Verify that the runtime role has commerce `SELECT` only, can perform only scoped workflow writes, and cannot bypass immutable evidence, append-only audit, terminal investigation, escalation derivation, or idempotency invariants.

### 3. Direct protocol-level MCP evaluation

Uses the official MCP client and the real Express `/mcp` route. It proves that the protocol surface, tool schemas, workflow persistence, idempotency, errors, and commerce immutability work without a model dependency.

### 4. Hosted provider-independent verifier

Connects to the already-running HTTPS endpoint and confirms that deployment, bearer authentication, tool discovery, the representative end-to-end workflow, and safe reads work without `MODEL_API_KEY`.

### 5. MCP Inspector

Provides independent manual protocol evidence that a standard MCP client can connect, inspect the exact tool surface, execute the workflow, and retrieve persisted trace data.

### 6. Hosted model-backed evaluator

Uses the provider-neutral AI host and Gemini to run all nine natural-language scenarios against the hosted MCP while comparing the model-backed result with the frozen deterministic expectations.

### 7. Gemini CLI independent-client verification

Demonstrates that a separate MCP-compatible AI client can discover the hosted tools, select `list_demo_cases` followed by `investigate_order_exception`, and produce a grounded answer from the same remote MCP endpoint.

## Visual evidence

### Verification report

[Download the full Hosted MCP Verification Report](evidence/final-submission/00-hosted-mcp-verification-report.pdf)

![First page of the hosted verification report](evidence/final-submission/00-hosted-mcp-verification-report-preview.png)

### Inspector tool discovery

![MCP Inspector exact tool catalog](evidence/final-submission/02-inspector-five-tools.png)

### Independent AI-client result

![Gemini CLI grounded result](evidence/final-submission/06-gemini-grounded-result.png)

The complete screenshot index is available in [Final submission evidence](evidence/final-submission/README.md).

## Known limitations

- One EC2 instance and one PostgreSQL container are a deliberate review-scope single point of failure.
- The shared bearer token provides deployment access, not individual user identity or per-reviewer authorization.
- The model provider is external and may be slow or unavailable because of quota, rate limits, or cost controls.
- Evidence snapshots are immutable. When source evidence changes, a new investigation is required rather than rewriting the old decision record.
- The dataset is synthetic and fixed for repeatable evaluation.
- The product recommends human action but intentionally exposes no commerce mutation capability.
- There is no frontend; the intended review surfaces are MCP Inspector and an MCP-compatible AI client.

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
