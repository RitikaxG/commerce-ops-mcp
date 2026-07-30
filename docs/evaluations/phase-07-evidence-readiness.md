# Phase 07 Evaluation Report - Evidence Readiness and Conflict Gate

## Goal

Evaluate a valid normalized evidence snapshot deterministically as `COMPLETE`,
`MISSING`, or `CONFLICTING` before any diagnosis, recommendation, or
persistence occurs.

## Scope implemented

- Added public readiness, missing-path, observation, and conflict Zod schemas.
- Added a pure readiness evaluator with the accepted conditional gate order.
- Added canonical source and field-level missing paths.
- Added structured inventory quantity-conflict detection.
- Corrected Phase 6 warehouse collection for partial dependency success.
- Added focused unit, collector-regression, and live nine-scenario tests.

## Public readiness result

`EvidenceReadinessResult` contains only:

- `schemaVersion: 1`;
- `orderId`;
- `evidenceStatus`, using the existing `EvidenceStatusSchema`;
- unique, lexically ordered `missingFields`;
- structured, path-ordered `conflicts`.

The Zod contract requires empty details for `COMPLETE`, at least one missing
path and no conflicts for `MISSING`, and at least one structured conflict for
`CONFLICTING`. A conflicting result may also preserve independently discovered
missing paths.

`@repo/diagnosis` exports:

- `EvidenceReadinessEvaluator`;
- `createEvidenceReadinessEvaluator()`.

Its runtime dependency is only `@repo/schemas`.

## Conditional readiness matrix

| Gate                | Required evidence                                                                                                      | Decisive complete path                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Core                | Successful order, order items, payment reads and present records                                                       | Continue only when all core evidence exists               |
| Payment             | Authoritative payment status                                                                                           | Any status other than `SUCCEEDED` is sufficient           |
| Shipment            | Successful shipment read                                                                                               | A present shipment is sufficient; `null` is valid absence |
| Failure event       | Successful fulfilment-event read                                                                                       | Creation or label failure is sufficient                   |
| Fulfilment          | Successful read, present record, assigned warehouse                                                                    | Required only when no earlier path is decisive            |
| Inventory/warehouse | Successful reads, assigned warehouse metadata, metadata for observed warehouses, assigned inventory for every item SKU | Required only for the remaining fulfilment-state path     |

The evaluator never requires unrelated downstream evidence after an earlier
decisive gate.

## Canonical missing paths

Unavailable required reads use only `sources.<SOURCE>`. Successful reads with
absent required values use `order`, `orderItems`, `payment`, `fulfilment`,
`fulfilment.assignedWarehouseId`, `warehouses.<warehouseId>`, or
`inventory.assignedWarehouse.<warehouseId>.<sku>`.

Paths are deduplicated and returned in deterministic lexical order. Raw errors,
SQL, credentials, and human prose cannot enter the result.

## Conflict shape and precedence

Two different inventory source systems reporting unequal quantities for the
same warehouse/SKU produce:

- code `INVENTORY_QUANTITY_MISMATCH`;
- path `inventory.<warehouseId>.<sku>.availableQuantity`;
- a fixed deterministic message;
- every observation ordered `WAREHOUSE_SYSTEM`, then `COMMERCE_SYSTEM`.

The evaluator does not select a winner, average values, or prefer the newest
record. Equal source quantities do not conflict. Final precedence is:

```text
CONFLICTING > MISSING > COMPLETE
```

## Freshness limitation

Source timestamps remain available for later policy and audit, but no accepted
maximum source ages exist. Phase 7 therefore does not classify evidence by age
or invent freshness thresholds.

## Phase 6 warehouse correction

Warehouse IDs now come from every still-available dependency:

- a successful fulfilment contributes its assigned warehouse;
- successful inventory contributes all observation warehouses;
- either successful dependency is enough to invoke the warehouse repository,
  including with an empty identifier list;
- warehouses are skipped only when neither dependency can provide identifiers.

## Approved-scenario results

All actual values came from
`createWorkflowRepositoryContext() -> createEvidenceCollector() -> EvidenceReadinessEvaluator`
using the restricted workflow connection.

| Order      | Expected      | Actual        | Detail                                    |
| ---------- | ------------- | ------------- | ----------------------------------------- |
| `ORD-1042` | `COMPLETE`    | `COMPLETE`    | No missing fields or conflicts            |
| `ORD-1043` | `COMPLETE`    | `COMPLETE`    | Creation-failure event is sufficient      |
| `ORD-1044` | `COMPLETE`    | `COMPLETE`    | Fulfilment-state evidence is coherent     |
| `ORD-1045` | `COMPLETE`    | `COMPLETE`    | Label-failure event is sufficient         |
| `ORD-1046` | `MISSING`     | `MISSING`     | Exact assigned inventory path below       |
| `ORD-1047` | `COMPLETE`    | `COMPLETE`    | Existing shipment is sufficient           |
| `ORD-1048` | `COMPLETE`    | `COMPLETE`    | Evidence is ready; no diagnosis is chosen |
| `ORD-1049` | `COMPLETE`    | `COMPLETE`    | Authoritative payment is `PROCESSING`     |
| `ORD-1050` | `CONFLICTING` | `CONFLICTING` | Exact structured conflict below           |

Exact `ORD-1046` result:

```json
{
  "schemaVersion": 1,
  "orderId": "ORD-1046",
  "evidenceStatus": "MISSING",
  "missingFields": ["inventory.assignedWarehouse.WH-A.SKU-1046"],
  "conflicts": []
}
```

Exact `ORD-1050` result:

```json
{
  "schemaVersion": 1,
  "orderId": "ORD-1050",
  "evidenceStatus": "CONFLICTING",
  "missingFields": [],
  "conflicts": [
    {
      "code": "INVENTORY_QUANTITY_MISMATCH",
      "path": "inventory.WH-A.SKU-1050.availableQuantity",
      "message": "Inventory sources report different available quantities for WH-A/SKU-1050.",
      "observations": [
        {
          "sourceSystem": "WAREHOUSE_SYSTEM",
          "availableQuantity": 0,
          "observedAt": "2026-07-30T12:00:00.000Z"
        },
        {
          "sourceSystem": "COMMERCE_SYSTEM",
          "availableQuantity": 4,
          "observedAt": "2026-07-30T12:00:00.000Z"
        }
      ]
    }
  ]
}
```

## Automated checks

| Command / check                              | Expected                                      | Actual                                                  | Result |
| -------------------------------------------- | --------------------------------------------- | ------------------------------------------------------- | ------ |
| `bun install --frozen-lockfile`              | Lockfile current                              | 535 installs checked across 629 packages; no changes    | Pass   |
| `bun run db:verify-demo`                     | Approved seed; workflow empty                 | Approved commerce counts; all five workflow counts zero | Pass   |
| `bun run db:verify-access`                   | Existing access/invariants pass               | 6 tests, 68 assertions                                  | Pass   |
| `bun run --filter @repo/db test`             | Database regression passes                    | 7 tests, 104 assertions                                 | Pass   |
| `bun run --filter @repo/evidence test`       | Collector plus correction passes              | 6 tests, 94 assertions                                  | Pass   |
| `bun run --filter @repo/diagnosis test`      | Pure and live readiness pass                  | 9 tests, 63 assertions                                  | Pass   |
| `bun run --filter @repo/diagnosis typecheck` | Strict type safety                            | Exited successfully                                     | Pass   |
| `bun run build`                              | Workspace builds                              | 14/14 Turbo tasks                                       | Pass   |
| `bun run typecheck`                          | Workspace typechecks                          | 14/14 Turbo tasks                                       | Pass   |
| `bun run test`                               | Full regression passes                        | 20/20 Turbo tasks                                       | Pass   |
| `bun run lint`                               | Configured lint passes                        | 2/2 Turbo tasks                                         | Pass   |
| Formatting and `git diff --check`            | Formatted; no whitespace errors               | Passed                                                  | Pass   |
| Static scope inspection                      | No forbidden runtime dependencies or behavior | Passed                                                  | Pass   |

## Diagnostics retained

The first root test attempt reached the unchanged fixture database test and
Bun 1.3.2 terminated with a runtime segmentation fault rather than an
assertion failure. The isolated database fixture then passed 1/1. A subsequent
full fixture attempt lost its hosted PostgreSQL connection after 40 seconds;
read-only verification confirmed the approved database state remained intact.
The final unchanged root command passed 20/20 Turbo tasks, including fixtures
30/30, evidence 6/6, diagnosis 9/9, and database 7/7.

## Guardrails verified

- Diagnosis runtime imports only `@repo/schemas`.
- The evaluator has no clock, network, repository, database, Prisma,
  persistence, Express, MCP, agent, workflow, or evidence-runtime dependency.
- Results contain no diagnosis, confidence, matched rule, queue, escalation,
  or suggested action.
- Live evaluation used the restricted workflow repository.
- Database verification after evaluation retained every approved commerce row
  and zero workflow records.
- No migration, database schema, API route, environment file, or generated
  Prisma file changed.

## Files and packages changed

### Schemas

- `packages/schemas/evidence-readiness.ts`
- `packages/schemas/index.ts`

### Diagnosis

- `packages/diagnosis/readiness.ts`
- `packages/diagnosis/index.ts`
- `packages/diagnosis/package.json`
- `packages/diagnosis/tsconfig.json`
- `packages/diagnosis/tsconfig.build.json`
- `packages/diagnosis/tests/readiness.test.ts`
- `packages/diagnosis/tests/integration.test.ts`

### Evidence correction

- `packages/evidence/collector.ts`
- `packages/evidence/tests/collector.test.ts`

### Root and documentation

- `bun.lock`
- `AGENTS.md`
- `README.md`
- `docs/architecture/package-graph.md`
- `docs/evaluations/phase-06-evidence-collector.md`
- `docs/evaluations/phase-07-evidence-readiness.md`

## Known limitations

- No accepted freshness threshold exists; timestamps are preserved but not
  rejected by age.
- Phase 8 owns diagnosis codes, rule precedence, confidence, and suggested
  action.
- Operations repositories, persistence, audit, escalation, MCP, agent, trace,
  API, and UI behavior remain deferred.
- Hosted integration checks require access to the configured database.

## Decisions changed during review

The Phase 6 warehouse dependency condition was narrowed from requiring both
fulfilment and inventory success to using either still-available identifier
source. No accepted schema, database, or safety boundary changed.

## Proposed commit

`feat(diagnosis): add evidence readiness gate`

## Proposed PR title

`Phase 7: add deterministic evidence readiness and conflict gate`

No commit or push was performed.

## Exit decision

Awaiting review.
