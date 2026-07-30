# Phase 10 Evaluation Report — Remote MCP and Direct Tool Evaluations

## Goal

Expose the accepted persistent commerce-operations workflow through a standard
remote MCP server, while keeping deterministic evidence, diagnosis, persistence,
idempotency, escalation policy, and commerce safety inside the existing workflow
layer.

Phase 10 also adds a direct protocol-level evaluation that uses the official MCP
client over the real Streamable HTTP `/mcp` endpoint. Actual LLM/AI-host
integration remains Phase 11 work.

## Evaluation decision

**Phase 10 passes and is merged.**

The final live verification completed successfully before PR #9 was merged. It
ran the Phase 9 regressions, Phase 10 package checks, repository-wide checks, the
direct Streamable HTTP MCP evaluation, and final workflow cleanup.

Phase 10 merge commit:

```text
ef80769506bcb3b78b03cbc6a5333d153d2919e1
```

Final direct-evaluation summary:

```text
evaluation: phase-10-direct-mcp
status: PASS
sdk: @modelcontextprotocol/sdk@1.30.0
transport: Streamable HTTP
endpoint: /mcp
tools: 5
scenarios: 9
investigations: 9
review cases: 7
idempotency records: 17
commerceStateChanged: false
```

Final successful live workflow run: `30569038902`.

## Scope implemented

- Added the stable v1 official TypeScript MCP SDK at
  `@modelcontextprotocol/sdk@1.30.0`.
- Exposed a stateless Streamable HTTP MCP endpoint at `/mcp`.
- Registered exactly five approved tools.
- Added strict Zod input, success, and failure contracts.
- Added safe workflow-error and internal-error mapping.
- Added truthful MCP tool annotations and side-effect descriptions.
- Added Host-header allowlist protection for the MCP route.
- Preserved the existing `/health` endpoint.
- Added a deterministic demo-case catalog for bounded navigation only.
- Added direct MCP-client evaluation through the real Express application.
- Verified all nine synthetic scenarios through MCP.
- Verified escalation creation, rejection, retry, reuse, case reads, trace reads,
  forbidden-tool rejection, strict-input rejection, idempotency conflicts, and
  Host-header rejection.
- Added static and live GitHub Actions workflows.
- Preserved the runtime read-only commerce boundary.
- Added no model provider, model SDK, model name, LLM key, or model-backed
  evaluation.

## MCP transport and lifecycle

The API exposes:

```text
POST /mcp
```

The implementation uses `StreamableHTTPServerTransport` with:

```text
sessionIdGenerator = undefined
enableJsonResponse = true
```

This provides stateless Streamable HTTP handling. A fresh MCP server and
transport are created per request and closed after the response lifecycle. The
API runtime uses the existing restricted workflow factory backed by
`WORKFLOW_DATABASE_URL`.

The direct evaluator:

1. clears operations demo rows through the explicit owner-only testing path;
2. verifies the approved commerce fixtures and zero workflow rows;
3. builds and starts the real Express API on a random local port;
4. connects using the official `Client` and
   `StreamableHTTPClientTransport`;
5. executes catalog, investigation, escalation, read, and rejection checks;
6. compares commerce fixtures before and after;
7. closes the MCP client and API runtime;
8. clears operations rows in `finally`;
9. verifies approved commerce fixtures and zero workflow rows again.

## Approved tool catalog

The server registers exactly:

| Tool | Input | Operations writes | Commerce writes |
| --- | --- | ---: | ---: |
| `list_demo_cases` | `{}` | No | No |
| `investigate_order_exception` | `orderId`, `clientRequestId`, `idempotencyKey` | Yes | No |
| `create_human_review_escalation` | `investigationId`, `idempotencyKey` | Yes | No |
| `get_review_case` | `reviewCaseId` | No | No |
| `get_investigation_trace` | `investigationId` | No | No |

Annotations are:

- all tools: `destructiveHint=false`, `idempotentHint=true`,
  `openWorldHint=false`;
- read-only tools: `list_demo_cases`, `get_review_case`, and
  `get_investigation_trace`;
- workflow-write tools: `investigate_order_exception` and
  `create_human_review_escalation`.

No MCP prompts, generic resources, SQL tools, unrestricted HTTP tools, or
commerce mutation tools are advertised.

## Output contracts and error handling

Each successful tool result uses a versioned envelope:

```ts
{
  schemaVersion: 1;
  ok: true;
  result: T;
}
```

Expected and unexpected tool failures use a finite safe envelope:

```ts
{
  schemaVersion: 1;
  ok: false;
  error: {
    code: WorkflowErrorCode | "INTERNAL_ERROR";
    message: SafeMessage;
  };
  commerceStateChanged: false;
}
```

The MCP adapter validates concrete success and failure values before returning
`structuredContent`. Raw exceptions, stack traces, SQL, credentials, connection
strings, and unrestricted provider payloads are not returned.

## Synthetic-scenario evaluation

All nine approved scenarios were executed through the official MCP client and
the real `/mcp` route.

| Order | Investigation | Evidence | Diagnosis | Escalation |
| --- | --- | --- | --- | --- |
| `ORD-1042` | `COMPLETED` | `COMPLETE` | `ASSIGNED_WAREHOUSE_OUT_OF_STOCK` | Created in `FULFILMENT_OPERATIONS` |
| `ORD-1043` | `COMPLETED` | `COMPLETE` | `FULFILMENT_CREATION_FAILED` | Created in `FULFILMENT_OPERATIONS` |
| `ORD-1044` | `COMPLETED` | `COMPLETE` | `WITHIN_EXPECTED_PROCESSING_TIME` | Rejected as not required |
| `ORD-1045` | `COMPLETED` | `COMPLETE` | `SHIPMENT_LABEL_CREATION_FAILED` | Created in `SHIPPING_OPERATIONS` |
| `ORD-1046` | `NEEDS_MORE_INFO` | `MISSING` | `null` | Created in `OPERATIONS_DATA_REVIEW` |
| `ORD-1047` | `COMPLETED` | `COMPLETE` | `SHIPMENT_ALREADY_EXISTS` | Rejected as not required |
| `ORD-1048` | `COMPLETED` | `COMPLETE` | `CAUSE_NOT_DETERMINED` | Created in `GENERAL_COMMERCE_OPERATIONS` |
| `ORD-1049` | `COMPLETED` | `COMPLETE` | `PAYMENT_NOT_CONFIRMED` | Created in `PAYMENT_OPERATIONS` |
| `ORD-1050` | `NEEDS_MORE_INFO` | `CONFLICTING` | `null` | Created in `OPERATIONS_DATA_REVIEW` |

Additional scenario assertions passed:

- `ORD-1042` returned `WH-B` as the eligible alternative warehouse.
- `ORD-1044` preserved the fixed `90` elapsed minutes and `240` minute window.
- `ORD-1046` preserved the exact missing path
  `inventory.assignedWarehouse.WH-A.SKU-1046` and returned no diagnosis.
- `ORD-1048` fell through to `CAUSE_NOT_DETERMINED`.
- `ORD-1050` preserved the structured inventory conflict and returned no
  diagnosis.
- Investigation calls created no review cases automatically.
- Every investigation and escalation result reported
  `commerceStateChanged=false`.

## Persistence and idempotency results

The direct evaluation observed:

| Stage | Investigations | Evidence | Review cases | Idempotency |
| --- | ---: | ---: | ---: | ---: |
| After nine investigations | 9 | 9 | 0 | 9 |
| After seven eligible escalation calls | 9 | 9 | 7 | 16 |
| After second-key case reuse | 9 | 9 | 7 | 17 |
| Final cleanup | 0 | 0 | 0 | 0 |

Verified behavior:

- same investigation key plus identical input returned the exact stored result;
- investigation retry added no workflow rows;
- same investigation key plus different input returned
  `IDEMPOTENCY_KEY_REUSE`;
- same escalation key plus identical input returned the exact stored result;
- a second escalation key for the same investigation returned `REUSED` with the
  original review-case ID;
- no duplicate review case was created;
- different-investigation reuse of an escalation key returned
  `IDEMPOTENCY_KEY_REUSE`;
- `ORD-1044` and `ORD-1047` returned `ESCALATION_NOT_ALLOWED` and created no
  case.

## Read and trace evaluation

`get_review_case` returned the persisted case and matching source
investigation.

`get_investigation_trace` returned:

- the matching persisted investigation;
- the immutable evidence snapshot;
- ordered safe audit events;
- the expected escalation create and reuse audit sequence.

Repeated read operations did not change operations counts or add audit rows.
Missing review-case and investigation IDs returned finite safe workflow errors.

## Safety and rejection evaluation

The direct evaluator verified rejection of:

- the unregistered `update_order` tool;
- caller-supplied diagnosis in an investigation request;
- caller-supplied queue, reason, or suggested action in an escalation request;
- empty identifiers;
- investigation idempotency-key reuse with different input;
- escalation idempotency-key reuse with a different investigation;
- missing review-case and investigation IDs;
- a disallowed Host header.

The disallowed Host request returned HTTP `403` with:

```json
{
  "error": "MCP_HOST_NOT_ALLOWED"
}
```

Rejected calls produced no unintended workflow rows and no commerce changes.

## Automated verification

### Static workflow

The `Phase 10 static checks` workflow passed:

- frozen Bun install;
- Prisma client generation;
- MCP type-check;
- MCP tests;
- API type-check;
- API tests;
- evaluations type-check;
- evaluations tests.

### Live Phase 9 and Phase 10 workflow

The `Phase 9 and 10 live verification` workflow passed:

- PostgreSQL 16 service initialization;
- Prisma generation;
- migrations;
- restricted role setup;
- approved synthetic fixture reset;
- fixture and access-boundary verification;
- DB, evidence, diagnosis, observability, and workflow regressions;
- MCP, API, and evaluation package checks;
- full repository build;
- strict TypeScript type-check;
- full repository tests;
- lint;
- direct Streamable HTTP MCP evaluation;
- final operations cleanup;
- final approved-commerce verification.

## Commerce immutability and cleanup

The direct evaluator compared the complete approved commerce fixture set and
commerce summary before and after all MCP calls. They remained equal.

The `finally` cleanup then verified:

```text
investigations = 0
investigationEvidence = 0
humanReviewEscalations = 0
idempotencyRecords = 0
auditEvents = 0
```

Commerce records remained the approved synthetic fixtures.

## Issues found and fixed during evaluation

### 1. CI Prisma generation

Static CI originally attempted TypeScript checks before generating the Prisma
client. An explicit `bun run db:generate` step was added.

### 2. Host-header test transport

The initial Host-header rejection test used `fetch`, which did not reliably
preserve an overridden `Host` header. The evaluator now sends the request through
a lower-level HTTP request path so the actual header boundary is tested.

### 3. Evaluation TypeScript narrowing

A direct-evaluation comparison included `FAILED` after the result had already
been narrowed to `COMPLETED | NEEDS_MORE_INFO`. The redundant comparison was
removed and the evaluator was split into focused modules.

### 4. Success-only MCP output schema

The MCP SDK rejected valid error envelopes because tools advertised only a
success output schema. The advertised output contract was changed to a union of
the concrete success envelope and the finite failure envelope. Concrete values
remain strictly validated before return.

### 5. Strict intersection JSON Schema

`sourceReads` used intersections between a strict base object and a
source-literal object. The generated JSON Schema contained conflicting
`additionalProperties=false` rules and rejected valid source-read records. The
tuple now uses complete source-specific strict schemas without intersections.

### 6. Turborepo environment forwarding

Repository-wide tests executed through Turbo initially did not receive the
required database variables in CI. The approved database environment variables
were added to Turbo task forwarding.

## Files changed

### CI and root

- `.github/workflows/phase10-live.yml`
- `.github/workflows/phase10-static.yml`
- `turbo.json`
- `AGENTS.md`
- `README.md`

### API and MCP

- `apps/api/tests/health.test.ts`
- `packages/mcp/index.ts`
- `packages/schemas/index.ts`
- `packages/schemas/mcp.ts`
- `packages/schemas/normalized-evidence.ts`

### Direct evaluations

- `packages/evaluations/assertions.ts`
- `packages/evaluations/contracts.ts`
- `packages/evaluations/direct-mcp.ts`
- `packages/evaluations/direct/catalog.ts`
- `packages/evaluations/direct/escalations.ts`
- `packages/evaluations/direct/investigations.ts`
- `packages/evaluations/direct/reads.ts`
- `packages/evaluations/direct/rejections.ts`
- `packages/evaluations/direct/run.ts`
- `packages/evaluations/index.ts`
- `packages/evaluations/runtime.ts`
- `packages/evaluations/tests/contracts.test.ts`

### Documentation

- `docs/architecture/package-graph.md`
- `docs/evaluations/phase-10-remote-mcp.md`

## Known limitations and improvements

- Actual LLM/AI-host integration, model tool selection, grounded explanations,
  prompt-injection testing, and model refusal evaluation remain Phase 11.
- The MCP endpoint has Host-header protection but no production OAuth or user
  authentication yet; deployment authentication belongs to later hardening.
- The workflow uses a bounded immutable synthetic dataset and fixed scenario
  reference time.
- CI uses disposable local PostgreSQL credentials. They are not production
  secrets, but step-scoping the owner, demo, and workflow URLs more narrowly
  would further demonstrate least-privilege process isolation.
- The API build is bundled for the direct evaluator; production deployment and
  external MCP-host compatibility evidence remain Phase 13 work.

## Phase 11 handoff

Phase 11 should add the provider-neutral AI-host boundary and one concrete model
provider. Before implementation, obtain:

```text
MODEL_PROVIDER
MODEL_NAME
MODEL_API_KEY
```

Phase 11 must evaluate:

- natural-language intent and order-ID extraction;
- selection of the correct approved MCP tools;
- tool ordering;
- no invented identifiers or evidence;
- no unnecessary or forbidden tool attempts;
- grounded explanation of structured MCP results;
- refusal of operational mutation requests;
- adversarial and prompt-injection behavior;
- no false claim that commerce state changed.

The deterministic workflow and MCP server remain authoritative for diagnosis,
escalation policy, persistence, and safety.

## Exit decision

**Complete and merged.** Phase 10 direct MCP evaluation and the combined Phase
9/10 verification are complete and passing. Phase 11 may begin from updated
`main`.
