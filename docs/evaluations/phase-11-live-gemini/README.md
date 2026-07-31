# Phase 11 Live Gemini Evaluation Evidence

## Result

**Core live model acceptance passed. Extended live checks were interrupted by the Gemini free-tier request limit.**

The run used the real Gemini API, the provider-neutral AI host, the official MCP client, the real Streamable HTTP `/mcp` endpoint, the deterministic workflow, and PostgreSQL.

All nine approved synthetic investigation scenarios completed with `outcome=ANSWERED`. Each result matched the frozen evidence status, diagnosis, escalation decision, queue, and suggested next step. Every result also confirmed `commerceStateChanged=false`.

After the nine-scenario suite completed, Gemini began returning repeated `429 RATE_LIMITED` responses during the additional combined investigation-and-escalation check. The host kept requests sequential, honored the provider retry delays, and used bounded retries. This is recorded as a provider-availability limitation rather than a deterministic workflow or MCP failure.

## Client-approved operating decision

The demo keeps the sequential queued provider approach.

- Gemini requests are serialized and paced.
- Transient provider failures use bounded retries.
- Exhausted request or project quota returns a safe, explicit provider error.
- The model provider is never allowed to mutate commerce state.
- Deterministic workflow and MCP demonstrations remain available when Gemini is temporarily unavailable.
- Free-tier reliability and throughput are documented product tradeoffs, not hidden assumptions.

## Run configuration

```text
provider: gemini
model: gemini-3.6-flash
scenario count: 9
provider minimum interval: 8000 ms
provider retries after first attempt: 5
maximum accepted retry delay: 120000 ms
execution: sequential
commerce mutations: disabled
```

## Core scenario evidence

| Order      | Evidence      | Diagnosis                         | Escalation queue              | Live result |
| ---------- | ------------- | --------------------------------- | ----------------------------- | ----------- |
| `ORD-1042` | `COMPLETE`    | `ASSIGNED_WAREHOUSE_OUT_OF_STOCK` | `FULFILMENT_OPERATIONS`       | Passed      |
| `ORD-1043` | `COMPLETE`    | `FULFILMENT_CREATION_FAILED`      | `FULFILMENT_OPERATIONS`       | Passed      |
| `ORD-1044` | `COMPLETE`    | `WITHIN_EXPECTED_PROCESSING_TIME` | None                          | Passed      |
| `ORD-1045` | `COMPLETE`    | `SHIPMENT_LABEL_CREATION_FAILED`  | `SHIPPING_OPERATIONS`         | Passed      |
| `ORD-1046` | `MISSING`     | `null`                            | `OPERATIONS_DATA_REVIEW`      | Passed      |
| `ORD-1047` | `COMPLETE`    | `SHIPMENT_ALREADY_EXISTS`         | None                          | Passed      |
| `ORD-1048` | `COMPLETE`    | `CAUSE_NOT_DETERMINED`            | `GENERAL_COMMERCE_OPERATIONS` | Passed      |
| `ORD-1049` | `COMPLETE`    | `PAYMENT_NOT_CONFIRMED`           | `PAYMENT_OPERATIONS`          | Passed      |
| `ORD-1050` | `CONFLICTING` | `null`                            | `OPERATIONS_DATA_REVIEW`      | Passed      |

## Observed provider limitation

The nine core scenarios finished before the provider limit was encountered. The next extended check emitted retry events similar to:

```text
activeStep: combined-investigation-escalation
code: RATE_LIMITED
retry delays observed: approximately 57 s, 52 s, and 53 s
maximum attempts configured: 6 total attempts
```

The retry-start events occurred only after the scheduled delay. The terminal output originally had no blank separator between scheduling and starting lines, which could make the retries appear immediate.

The run was stopped while the bounded retry sequence was still in progress. Therefore this evidence does **not** claim that the complete extended live matrix finished in one free-tier run.

## Acceptance boundary

Phase 11 acceptance is based on these separate guarantees:

1. The deterministic commerce workflow, evidence readiness, diagnosis, persistence, escalation, idempotency, and audit behavior are covered without a model dependency.
2. The hosted MCP boundary is independently demonstrable with the direct MCP evaluator.
3. Key-free agent tests cover provider mapping, strict tool schemas, tool ordering, hidden reliability identifiers, grounding, refusal, prompt injection, and safe provider failures.
4. The real Gemini integration successfully completed all nine approved core investigation scenarios through the real MCP endpoint.
5. Provider throttling is surfaced safely and does not imply that commerce state changed.

The free-tier model provider is therefore an optional availability boundary around the AI explanation and tool-selection host. It is not the source of truth for evidence, diagnosis, workflow state, or audit data.

## Demo behavior during provider unavailability

When Gemini is unavailable:

```text
Natural-language AI request
        ↓
Bounded provider retries
        ↓
Clear SAFE_ERROR / quota-unavailable response
        ↓
No commerce mutation
```

The underlying system remains demonstrable through:

```text
Approved synthetic commerce data
        ↓
Deterministic evidence collection and diagnosis
        ↓
Persistent workflow and audit records
        ↓
Read-only Streamable HTTP MCP tools
        ↓
Direct MCP evaluation or MCP Inspector
```

## Commands

Run the key-free checks and direct MCP evaluation:

```bash
bun run --filter @repo/agent typecheck
bun run --filter @repo/agent test
bun run --filter @repo/evaluations typecheck
bun run --filter @repo/evaluations test
bun run eval:mcp:direct
```

Run the explicit live model evaluation with a server-side key:

```bash
AGENT_DEBUG_SAFE_ERRORS=1 \
bun --env-file=.env.local run eval:agent:gemini
```

The live command is intentionally not part of ordinary CI because model availability, quota, latency, and cost are external and time-dependent.

## Final decision

**Accepted with a documented provider-limit tradeoff.**

The Phase 11 implementation is suitable to merge once static and regression CI pass on the branch. A single uninterrupted free-tier execution of every extended live check is not required by the client-approved demo boundary.