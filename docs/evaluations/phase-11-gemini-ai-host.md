# Phase 11 Evaluation Report — Gemini AI Host

## Goal

Add a provider-neutral AI host with one Gemini implementation that understands natural-language commerce-operations requests, selects only approved MCP tools, injects reliability identifiers in host code, executes tools through Streamable HTTP, and explains server-produced results without moving diagnosis or escalation policy into the model.

## Current decision

**Implementation and key-free verification are in progress and passing. Live Gemini acceptance is pending a rotated API key.**

The Gemini key originally pasted into chat is treated as exposed and was not used, stored, logged, or committed. Phase 11 cannot be accepted until the explicit live model-backed suite passes with a rotated key.

## Selected provider

```text
provider: gemini
model: gemini-3.6-flash
SDK: @google/genai@2.13.0
API: Interactions API
store: false
thinking level: low
streaming: disabled
built-in tools: disabled
```

Gemini 3.6 Flash is selected as the exact stable model identifier rather than a moving alias. The implementation uses manual function declarations, manual MCP execution, and manual function-result return.

The current Gemini 3.6 API deprecates sampling controls such as temperature and does not use candidate-count configuration for this flow. The implementation therefore freezes model ID, low thinking, one sequential host-controlled tool call per turn, output-token limits, provider timeout, and retry behavior instead of sending unsupported sampling fields.

## Architecture

```text
User message
    ↓
packages/agent
- deterministic intent preflight
- exact MCP discovery
- model-facing tool projection
- host-generated IDs
- tool policy and ordering
- compact result projection
- grounding validation
    ↓
Gemini Interactions API selects one approved tool
    ↓
official MCP Client + StreamableHTTPClientTransport
    ↓
real /mcp endpoint
    ↓
deterministic workflow and PostgreSQL
    ↓
validated structured MCP result
    ↓
Gemini structured explanation
    ↓
deterministic grounding gate and final response assembly
```

`packages/agent` imports neither workflow, MCP server implementation, database, Prisma, evidence, diagnosis, fixtures, nor application code. It reaches the workflow only through the remote MCP protocol.

## Provider-neutral boundary

The `ModelProvider` interface exposes:

- model availability verification;
- one tool-selection turn;
- one structured explanation turn;
- provider-neutral tool calls and usage metadata;
- explicit session cleanup.

Gemini SDK types do not cross the package boundary. Provider errors are normalized into finite safe codes such as authentication failure, model unavailable, rate limited, timeout, invalid provider response, and provider unavailable.

## Exact MCP discovery

The host connects through the official MCP client and requires exactly:

```text
list_demo_cases
investigate_order_exception
create_human_review_escalation
get_review_case
get_investigation_trace
```

Startup fails safely if a tool is missing or an unexpected capability is advertised. The AI host does not consume MCP prompts, resources, sampling, SQL, generic HTTP, or mutation capabilities.

## Model-facing tool surface

The model receives only:

```text
list_demo_cases: {}
investigate_order_exception: { orderId }
create_human_review_escalation: { investigationId }
get_review_case: { reviewCaseId }
get_investigation_trace: { investigationId }
```

It never receives:

- `clientRequestId`;
- investigation or escalation idempotency keys;
- diagnosis or evidence input fields;
- queue, reason, suggested action, or warehouse-selection input fields;
- database credentials or unrestricted evidence.

## Host-generated identifiers

The host creates:

```text
runId
clientRequestId
investigation idempotency key
escalation idempotency key
```

One logical investigation receives one client-request ID and one investigation idempotency key. A retry of the same MCP operation reuses the same key. Escalation is a separate operation with a distinct key. Runtime IDs use `crypto.randomUUID()`; evaluation IDs are deterministic and scenario-scoped.

## Tool policy

- Demo discovery uses only `list_demo_cases`.
- An order investigation must use `investigate_order_exception`; the model cannot answer from scenario memory.
- Investigation never creates a review case automatically.
- A combined investigation/escalation request runs investigation first and calls escalation only when the stored result says `shouldEscalate=true`.
- Normal processing and existing shipment outcomes do not escalate.
- Trace and case reads require their explicit persisted identifiers.
- Mutation, SQL, reassignment, hold-release, payment-update, retry, and shipment-creation requests are refused before any model or MCP call.
- Only one tool call is accepted per model turn.
- Maximum tool steps are four and maximum model turns are six.

## Compact result projection

The host keeps the complete validated MCP response for deterministic output assembly but sends Gemini only allowlisted decision fields.

Investigation projection includes:

- order and investigation IDs;
- investigation and evidence state;
- diagnosis and matched rule;
- selected supporting facts;
- escalation recommendation and queue;
- exact suggested next step;
- eligible alternative warehouses;
- `commerceStateChanged=false`.

Idempotency values, client-request IDs, complete evidence snapshots, raw audit payloads, database records, and internal errors are excluded.

## Grounding gate

Gemini returns only:

```text
summary
reason
nextStep
```

The host deterministically verifies:

- exact preservation of the server-produced next step;
- no diagnosis when diagnosis is null;
- no invented queue, identifier, or warehouse;
- no review-case creation claim before a successful escalation;
- no claim that commerce was reassigned, released, retried, updated, shipped, or fixed;
- no secret-like content.

One repair attempt is allowed. A second failure returns `SAFE_ERROR`; the host does not silently turn an ungrounded explanation into a passing response. The deterministic final assembler adds `No commerce state was changed.`

## Safe observability

The public result contains a bounded in-memory tool trace with tool name, model-facing arguments, execution outcome, compact result summary, and duration. Generated idempotency keys, raw prompts, complete Gemini responses, hidden reasoning, database URLs, and secrets are not stored in PostgreSQL or returned to the user.

## Key-free tests

The key-free test suite covers:

- host-generated IDs and hidden reliability fields;
- idempotency-key reuse on MCP retry;
- distinct escalation keys;
- investigation-before-escalation ordering;
- non-actionable escalation blocking;
- missing-ID behavior;
- mutation refusal without model or MCP execution;
- unknown and multiple tool-call rejection;
- exact five-tool projection and strict argument schemas;
- unexpected MCP discovery failure;
- user-message prompt-injection preflight;
- compact grounding and one bounded repair;
- Gemini Interactions API request, function-call, function-result, structured-output, usage, and safe-error mapping.

The Phase 11 CI also runs the complete Phase 9/10 package regressions, repository build/type-check/test/lint, direct MCP evaluation, commerce verification, and final workflow cleanup using frozen dependencies.

## Live evaluator

The explicit serial command is:

```bash
bun --env-file=.env.local run eval:agent:gemini
```

It requires:

```text
MODEL_PROVIDER=gemini
MODEL_NAME=gemini-3.6-flash
MODEL_API_KEY=<rotated key>
```

The evaluator:

1. clears only demo operations rows through the owner-only helper;
2. verifies approved commerce fixtures and zero workflow rows;
3. builds and starts the real Express API on a random port;
4. verifies model availability;
5. runs the real Gemini API;
6. executes all MCP calls through the official client and Streamable HTTP;
7. evaluates all nine natural-language investigations;
8. tests discovery, missing input, unknown orders, escalation ordering, trace and case reads;
9. tests seven mutation/adversarial refusals;
10. tests user-message and controlled tool-result prompt injection;
11. repeats three stability scenarios three times;
12. aggregates model calls and token usage and estimates standard paid cost;
13. compares complete commerce fixtures before and after;
14. closes resources and clears operations rows in `finally`;
15. verifies final zero workflow counts.

## Frozen scenario expectations

| Order      | Evidence      | Diagnosis                         | Human review                  |
| ---------- | ------------- | --------------------------------- | ----------------------------- |
| `ORD-1042` | `COMPLETE`    | `ASSIGNED_WAREHOUSE_OUT_OF_STOCK` | `FULFILMENT_OPERATIONS`       |
| `ORD-1043` | `COMPLETE`    | `FULFILMENT_CREATION_FAILED`      | `FULFILMENT_OPERATIONS`       |
| `ORD-1044` | `COMPLETE`    | `WITHIN_EXPECTED_PROCESSING_TIME` | No                            |
| `ORD-1045` | `COMPLETE`    | `SHIPMENT_LABEL_CREATION_FAILED`  | `SHIPPING_OPERATIONS`         |
| `ORD-1046` | `MISSING`     | `null`                            | `OPERATIONS_DATA_REVIEW`      |
| `ORD-1047` | `COMPLETE`    | `SHIPMENT_ALREADY_EXISTS`         | No                            |
| `ORD-1048` | `COMPLETE`    | `CAUSE_NOT_DETERMINED`            | `GENERAL_COMMERCE_OPERATIONS` |
| `ORD-1049` | `COMPLETE`    | `PAYMENT_NOT_CONFIRMED`           | `PAYMENT_OPERATIONS`          |
| `ORD-1050` | `CONFLICTING` | `null`                            | `OPERATIONS_DATA_REVIEW`      |

Actual live-model results remain pending the rotated key and must be recorded here before Phase 11 acceptance.

## Cost accounting

Provider-reported input, output, and total tokens are aggregated. The explicit evaluator estimates standard paid cost using the official evaluation-date rates:

```text
$1.50 per 1M input tokens
$7.50 per 1M output tokens
```

The estimate lives only in the evaluation layer, not in deterministic workflow runtime code. Actual totals remain pending the live run.

## CI

- `phase11-static.yml` requires no model key and uses frozen dependencies.
- `phase11-live-gemini.yml` is manual-only and reads `MODEL_API_KEY` from a repository secret.
- The live workflow skips safely when the secret is absent.
- No real key exists in workflow YAML or tracked environment files.

## Known limitations

- Live Gemini evaluation is pending a rotated key.
- The AI host currently provides a server-side CLI rather than a chat UI.
- The MCP server is local until the protected post-Phase 11 staging deployment.
- Hosted authentication is not implemented in Phase 11; the client already supports an optional bearer token.
- The workflow remains intentionally bounded to immutable synthetic evidence and the approved shipment-gap investigation.
- No conversation memory, RAG, multi-agent orchestration, built-in Gemini tools, browser model call, or commerce mutation was added.

## Exit decision

**Awaiting live Gemini evaluation.** The implementation and key-free regression boundary may be reviewed, but Phase 11 must not be marked complete or merged until the real model suite passes with a rotated key and the actual token, cost, scenario, refusal, stability, commerce, and cleanup results are added to this report.
