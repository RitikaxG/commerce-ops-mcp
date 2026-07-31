# Phase 11 Evaluation Report — Gemini AI Host

## Goal

Add a provider-neutral AI host with one Gemini implementation that understands natural-language commerce-operations requests, selects only approved MCP tools, injects reliability identifiers in host code, executes tools through Streamable HTTP, and explains server-produced results without moving evidence, diagnosis, escalation policy, or commerce mutation into the model.

## Final decision

**Phase 11 is accepted with a documented Gemini free-tier reliability and performance tradeoff.**

The implementation, key-free verification, deterministic workflow, direct MCP evaluation, and core live Gemini scenario suite are complete. All nine approved synthetic investigations passed through the real Gemini provider and real MCP endpoint.

The extended live matrix did not finish in one run because Gemini began returning repeated `429 RATE_LIMITED` responses after the nine core scenarios. The client approved keeping the sequential queued approach, bounded retries, clear quota-unavailable errors, and independent demonstration of the deterministic workflow and hosted MCP when the provider is temporarily unavailable.

The raw terminal log has been replaced by a readable evidence report:

- [Phase 11 live Gemini evidence](./phase-11-live-gemini/README.md)

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

The implementation freezes the model ID, thinking level, sequential host-controlled tool calls, output-token limits, provider timeout, request pacing, and retry behavior. Provider-specific SDK types do not cross the model-provider boundary.

## Architecture

```text
User message
    ↓
packages/agent
- deterministic intent preflight
- exact MCP discovery
- model-facing tool projection
- host-generated reliability IDs
- tool policy and ordering
- compact result projection
- grounding validation
    ↓
Gemini selects one approved tool
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

`packages/agent` does not import workflow internals, MCP server implementation, database code, Prisma, evidence, diagnosis, fixtures, evaluations, or applications. It reaches the workflow only through the MCP protocol.

## Exact MCP surface

The host requires exactly these five tools:

```text
list_demo_cases
investigate_order_exception
create_human_review_escalation
get_review_case
get_investigation_trace
```

Startup fails safely if an expected tool is missing or an unexpected capability is advertised. The AI host does not consume MCP prompts, resources, sampling, SQL, generic HTTP, or commerce-mutation capabilities.

## Model-facing boundary

The model receives only the minimum approved arguments:

```text
list_demo_cases: {}
investigate_order_exception: { orderId }
create_human_review_escalation: { investigationId }
get_review_case: { reviewCaseId }
get_investigation_trace: { investigationId }
```

The model never receives:

- client request IDs
- investigation or escalation idempotency keys
- database credentials
- unrestricted evidence snapshots
- diagnosis inputs
- queue or suggested-action inputs
- commerce mutation tools

The host creates runtime IDs and reliability keys. A retry of the same MCP operation reuses the same idempotency key.

## Tool and mutation policy

- Demo discovery uses only `list_demo_cases`.
- Investigation uses `investigate_order_exception`; the model cannot answer from remembered scenario data.
- Investigation does not create a review case automatically.
- A combined request investigates first and escalates only when the persisted result says `shouldEscalate=true`.
- Normal processing and existing shipment outcomes do not escalate.
- Trace and case reads require their persisted identifiers.
- Reassignment, hold release, payment update, shipment retry, SQL, and other mutation requests are refused before model or MCP execution.
- Only one tool call is accepted per model turn.
- Model turns, tool steps, provider retries, retry delay, and provider timeouts are bounded.

## Grounding and safe output

Gemini returns a structured explanation containing:

```text
summary
reason
nextStep
```

The host deterministically validates that the explanation:

- preserves the workflow-produced next step
- does not invent diagnosis when diagnosis is `null`
- does not invent queues, IDs, warehouses, or evidence
- does not claim that a review case exists before successful escalation
- does not claim that commerce was reassigned, released, retried, updated, shipped, or fixed
- does not expose secret-like values

One bounded repair attempt is allowed. A second grounding failure returns `SAFE_ERROR`. The final assembler always states that no commerce state was changed.

## Sequential provider queue and bounded retries

Gemini requests remain serialized through the provider request queue. The provider tracks the next allowed request time and waits before starting the next request.

The evaluation configuration used:

```text
minimum request interval: 8000 ms
retries after first attempt: 5
maximum accepted retry delay: 120000 ms
```

Transient `429`, timeout, and provider `5xx` failures use bounded retries. Provider-advertised retry delays are honored when they are within the configured maximum. Daily or project quota exhaustion is not retried indefinitely.

When the provider limit is unavailable, the agent returns a safe provider error containing either the quota condition or the retry delay. It never reports success and never changes commerce state.

## Provider-unavailable demonstration boundary

Gemini availability is not required to demonstrate the authoritative system:

```text
Synthetic commerce fixtures
        ↓
Evidence collection and readiness
        ↓
Deterministic diagnosis
        ↓
Persistent investigation and audit records
        ↓
Read-only MCP tools
        ↓
Direct MCP evaluator or MCP Inspector
```

The model is used for natural-language tool selection and grounded explanation. It is not the source of truth for order data, evidence, diagnosis, escalation recommendation, workflow state, or audit history.

## Key-free verification

The key-free suite covers:

- provider-neutral contracts and Gemini request mapping
- exact five-tool discovery
- strict model-facing argument schemas
- host-generated and hidden reliability fields
- idempotency-key reuse across MCP retry
- distinct escalation keys
- investigation-before-escalation ordering
- missing-ID and unknown-order behavior
- mutation refusal without model or MCP execution
- unexpected and multiple tool-call rejection
- compact result projection
- grounding and one bounded repair
- prompt injection and adversarial content
- safe authentication, model, timeout, rate-limit, quota, response, and provider failures
- provider retry-delay enforcement
- no retry loop after daily quota exhaustion

Static CI also runs the Phase 9 and Phase 10 regressions, repository build, type checking, tests, lint, direct MCP evaluation, database-boundary verification, and final workflow cleanup.

## Core live Gemini results

The live run used:

```bash
AGENT_DEBUG_SAFE_ERRORS=1 \
bun --env-file=.env.local run eval:agent:gemini
```

All nine approved investigation scenarios completed with `outcome=ANSWERED`:

```text
ORD-1042 | COMPLETE    | ASSIGNED_WAREHOUSE_OUT_OF_STOCK | FULFILMENT_OPERATIONS       | Passed
ORD-1043 | COMPLETE    | FULFILMENT_CREATION_FAILED      | FULFILMENT_OPERATIONS       | Passed
ORD-1044 | COMPLETE    | WITHIN_EXPECTED_PROCESSING_TIME | No review                   | Passed
ORD-1045 | COMPLETE    | SHIPMENT_LABEL_CREATION_FAILED  | SHIPPING_OPERATIONS         | Passed
ORD-1046 | MISSING     | null                            | OPERATIONS_DATA_REVIEW      | Passed
ORD-1047 | COMPLETE    | SHIPMENT_ALREADY_EXISTS         | No review                   | Passed
ORD-1048 | COMPLETE    | CAUSE_NOT_DETERMINED            | GENERAL_COMMERCE_OPERATIONS | Passed
ORD-1049 | COMPLETE    | PAYMENT_NOT_CONFIRMED           | PAYMENT_OPERATIONS          | Passed
ORD-1050 | CONFLICTING | null                            | OPERATIONS_DATA_REVIEW      | Passed
```

Each result matched the frozen expected evidence status, diagnosis, escalation decision, queue, and suggested next step. Each result also reported `commerceStateChanged=false`.

## Observed live-provider limitation

After the nine core scenarios completed, the additional combined investigation-and-escalation check encountered repeated Gemini `429 RATE_LIMITED` responses.

Observed retry delays were approximately 57 seconds, 52 seconds, and 53 seconds. Retry-start events occurred only after their scheduled delays. The run was stopped while the bounded retry sequence was still active.

This means:

- the complete extended live matrix did not finish in one free-tier run
- the nine core model-backed scenarios did finish successfully
- the deterministic workflow and MCP endpoint were not the failing components
- no evidence supports claiming that commerce state changed
- the free-tier provider remains unsuitable as a strict availability or performance dependency

## CI policy

The real Gemini evaluation remains explicit and manual. It is not part of ordinary merge CI because provider quota, latency, availability, and cost are external and time-dependent.

Merge CI requires the deterministic and key-free checks to pass. The manual live workflow safely skips when `MODEL_API_KEY` is absent.

## Security and secret handling

The Gemini key previously pasted into chat is treated as exposed. It must not be used, stored, logged, or committed. Live runs must use a rotated server-side key.

The provider key is never sent to a browser, included in MCP arguments, written to PostgreSQL, or returned in the public agent result.

## Known limitations

- Free-tier Gemini runs can be slow because requests are sequential and provider retry delays can be close to one minute.
- A long extended live matrix may span multiple quota windows or require a paid quota allocation.
- The AI host currently exposes a server-side CLI rather than a chat UI.
- Conversation memory, RAG, multi-agent orchestration, built-in Gemini tools, and commerce mutation are intentionally out of scope.
- Provider availability remains external; the deterministic workflow and hosted MCP must be demonstrated independently.

## Exit decision

**Phase 11 complete — accepted with documented provider-limit tradeoff.**

The branch may be merged after its static and regression checks pass. The client-approved acceptance boundary does not require every extended live check to finish in one uninterrupted free-tier run.
