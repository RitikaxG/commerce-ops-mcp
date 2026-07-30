# Workflow Contract

## Contract status

This Phase 0 contract for the AI-First Commerce Operations Investigator was accepted on 2026-07-30.

It freezes the user, bounded question, evidence expectations, safety boundary, outcomes, and planned MCP capabilities. It does not approve the detailed PostgreSQL schema or authorize application, database, AI, or MCP implementation.

## Selected user

The primary user is a commerce operations specialist investigating an order exception through an MCP-compatible AI host.

The user needs a grounded explanation and a persistent handoff to a human team. They do not need or receive an automated operational fix.

## Bounded question

> Why has this paid order not reached shipment creation?

The workflow accepts an order identifier, reads the available commerce evidence, evaluates whether that evidence is complete and coherent, applies deterministic TypeScript rules, and returns a structured explanation.

The operator's statement that an order is paid is context, not source-of-truth evidence. If the payment record does not confirm payment, the workflow returns `PAYMENT_NOT_CONFIRMED`.

## Responsibility split

| Layer                  | Responsibility                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| Operations user        | Requests an investigation and reviews the evidence-based next step.                                     |
| MCP-compatible AI host | Selects approved tools and explains their structured results in business language.                      |
| MCP server             | Validates inputs and exposes only the approved investigation, escalation, case, and trace capabilities. |
| Evidence service       | Reads every relevant source and produces one normalized snapshot with observation times.                |
| Diagnosis service      | Applies the completeness/conflict gate and deterministic TypeScript diagnosis rules.                    |
| Workflow service       | Persists investigations, snapshots, escalations, idempotency records, and audit events.                 |
| PostgreSQL             | Separates read-only `commerce` evidence from scoped writable `operations` workflow records.             |

The LLM does not create business facts, decide diagnosis rules, or submit free-form evidence. It selects tools and explains server-produced structured results.

## Required evidence

Every investigation attempts to read all scoped sources. A missing source is recorded explicitly; it is never replaced with an assumption.

| Evidence source    | Required decision inputs                                                                                                                                                         |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Order              | Order identity, current status, line-item SKUs and positive quantities, and source timestamps.                                                                                   |
| Payment            | Current payment status, amount/currency context where available, and observation time.                                                                                           |
| Fulfilment         | Whether a fulfilment exists, its status, hold reason, assigned warehouse, and relevant timestamps.                                                                               |
| Inventory          | Observed stock for every order SKU at the assigned warehouse. Alternative-warehouse eligibility requires complete, fresh-enough evidence for every order line at that warehouse. |
| Shipment           | Whether a shipment exists and, when present, its status, fulfilment reference, and creation time.                                                                                |
| Operational events | Ordered fulfilment/progression/failure events with type, status, safe details, and occurrence time.                                                                              |
| Source metadata    | An `observedAt` value or explicit source error/missing marker for each source read.                                                                                              |

Phase 7 will define the precise field-level readiness matrix. Until then, the permanent rule is that any absent or conflicting input needed for a conclusion blocks that conclusion.

## Evidence states and workflow outcomes

Evidence state and workflow lifecycle are separate:

| Evidence state | Meaning                                                         | Required workflow behavior                                        |
| -------------- | --------------------------------------------------------------- | ----------------------------------------------------------------- |
| `COMPLETE`     | All inputs needed for a rule are present and coherent.          | A deterministic diagnosis may run.                                |
| `MISSING`      | A required source or field is absent or unreadable.             | Persist `NEEDS_MORE_INFO`, list missing fields, and do not guess. |
| `CONFLICTING`  | Relevant sources disagree in a way that affects the conclusion. | Persist `NEEDS_MORE_INFO`, list conflicts, and do not guess.      |

### Clear success state

An investigation succeeds when it:

1. reads and timestamps the scoped evidence;
2. persists an immutable decision-time snapshot;
3. determines that evidence is `COMPLETE`;
4. applies a deterministic rule and records the matched rule;
5. persists a `COMPLETED` investigation and observable audit events; and
6. returns the diagnosis, supporting facts, suggested human next step, identifiers, and `commerceStateChanged=false`.

Success does not mean that an order was fixed, rerouted, retried, or shipped.

### Clear stop and escalation state

When evidence is `MISSING` or `CONFLICTING`, the workflow stops before diagnosis and persists:

- investigation status `NEEDS_MORE_INFO`;
- the evidence state;
- explicit `missingFields` and/or conflicts;
- no diagnosis code; and
- only a next step that requests verification of the uncertain evidence.

A persistent human-review escalation may be created for either a completed diagnosis or `NEEDS_MORE_INFO`. It must be derived from the stored investigation and cannot contain model-supplied diagnosis or evidence.

An unexpected technical failure produces `FAILED`, a safe error code, and observable audit activity. It must not be presented as a business diagnosis.

## Diagnosis codes

Only deterministic TypeScript rules may produce these codes:

| Code                              | Contract meaning                                                                                                             |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `ASSIGNED_WAREHOUSE_OUT_OF_STOCK` | Payment is confirmed, no shipment exists, fulfilment is held for inventory, and the assigned warehouse lacks required stock. |
| `FULFILMENT_CREATION_FAILED`      | Evidence contains a scoped fulfilment-creation failure.                                                                      |
| `WITHIN_EXPECTED_PROCESSING_TIME` | Evidence shows normal processing within the accepted window.                                                                 |
| `SHIPMENT_LABEL_CREATION_FAILED`  | Evidence contains a scoped shipment-label creation failure.                                                                  |
| `SHIPMENT_ALREADY_EXISTS`         | A shipment already exists; the operator view may be stale.                                                                   |
| `PAYMENT_NOT_CONFIRMED`           | The payment source of truth does not confirm successful payment.                                                             |
| `CAUSE_NOT_DETERMINED`            | Evidence is complete but no more specific deterministic rule matches.                                                        |

`NEEDS_MORE_INFO` is an investigation status, not a diagnosis code. Missing or conflicting evidence must not fall through to `CAUSE_NOT_DETERMINED`.

Rule precedence, exact predicates, processing windows, confidence values, and queue mappings belong to later reviewed phases.

## Allowed reads and writes

### Commerce boundary

The runtime may read orders, order items, payments, warehouses, inventory, fulfilments, operational events, and shipments from `commerce`.

It must have no runtime capability to insert, update, or delete `commerce` data.

### Operations workflow boundary

The runtime may write only:

- investigations;
- immutable investigation evidence snapshots;
- human-review escalations;
- idempotency records; and
- append-only audit events.

Operations writes must describe the investigation and handoff. They must never imply that commerce state changed.

## Planned MCP capabilities

| Tool                             | Purpose                                                                                                                                 | Operations write                           | Commerce write |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | -------------- |
| `list_demo_cases`                | Discover synthetic orders and scenario categories.                                                                                      | None                                       | None           |
| `investigate_order_exception`    | Collect evidence, evaluate readiness, diagnose when supported, and persist the investigation, snapshot, idempotency, and audit records. | Scoped workflow records                    | Forbidden      |
| `create_human_review_escalation` | Create or return a persistent review case derived from a stored investigation.                                                          | Escalation, idempotency, and audit records | Forbidden      |
| `get_review_case`                | Return a persisted review case and its source investigation.                                                                            | None                                       | None           |
| `get_investigation_trace`        | Return ordered observable workflow and tool events.                                                                                     | None                                       | None           |

Tool annotations must describe operations-workflow persistence accurately. Every workflow response must make the commerce boundary explicit with `commerceStateChanged=false`.

## Human-review outcome

The workflow recommends, but never executes, a next action. If the operator requests escalation:

- the input identifies the stored investigation and supplies an idempotency key;
- the server derives the order, reason, queue, evidence summary, and suggested next step;
- the case begins in a human-review lifecycle such as `AWAITING_REVIEW`;
- safe retries return the same logical case; and
- the result never claims that the suggested action occurred.

For incomplete evidence, the handoff requests evidence verification rather than proposing a specific operational fix.

## Traceability boundary

Persist only observable activity needed to reconstruct the workflow:

- safe tool input/output summaries;
- source observation times;
- missing fields and conflicts;
- matched deterministic rule;
- investigation and escalation identifiers;
- duration and safe error codes; and
- ordered lifecycle events.

Do not persist hidden chain of thought, secrets, credentials, or unrestricted source payloads.

## Forbidden and out-of-scope operations

No tool, route, repository, or function may:

- reserve or release inventory;
- change a warehouse assignment;
- release a fulfilment hold;
- retry or create fulfilment;
- create, retry, or update a shipment;
- update an order or payment;
- mutate operational events;
- run raw SQL supplied by a caller;
- make an unrestricted API request; or
- claim that any of those actions occurred.

Also out of scope for this assignment are Redis, queues, Kafka, RAG, multi-agent orchestration, event sourcing, complex production authentication, and a frontend broader than the small read-only trace viewer.

## Phase review contract

Each phase must:

1. implement only its stated scope;
2. run and inspect its required checks;
3. update `AGENTS.md`, the README status table, and `docs/evaluations/phase-XX.md`;
4. record actual output, guardrails, limitations, and decision changes; and
5. stop for explicit review before the next phase.

## Phase 0 acceptance criteria

Phase 0 may be accepted when the reviewer confirms:

- the selected user and bounded question are correct;
- evidence sources and uncertainty behavior are sufficient;
- success, stop, failure, and human-review outcomes are unambiguous;
- every planned capability preserves read-only commerce state;
- the package graph is acyclic and responsibilities are owned once; and
- the Phase 1 schema proposal is the only authorized next deliverable.

After Phase 0 acceptance, Phase 1 may document the scoped PostgreSQL schema for client review. No application, Prisma migration, AI, or MCP implementation is authorized until that schema is accepted.
