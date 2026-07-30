# Approved Synthetic Investigation Scenarios

## Contract status

**Approved on 2026-07-30.**

This matrix supersedes earlier illustrative demo-case descriptions. Scenario changes require explicit client approval.

Every later investigation must persist an investigation, immutable evidence snapshot, and append-only audit trail with `commerceStateChanged=false`. A human-review escalation is created only when `shouldEscalate=true`.

## Scenario matrix

| Order      | Starting scenario                                                          | Evidence      | Investigation     | Diagnosis                         | Escalate | Queue                         |
| ---------- | -------------------------------------------------------------------------- | ------------- | ----------------- | --------------------------------- | -------- | ----------------------------- |
| `ORD-1042` | Assigned warehouse has no stock; another warehouse has sufficient stock    | `COMPLETE`    | `COMPLETED`       | `ASSIGNED_WAREHOUSE_OUT_OF_STOCK` | Yes      | `FULFILMENT_OPERATIONS`       |
| `ORD-1043` | Payment succeeded, but fulfilment creation failed                          | `COMPLETE`    | `COMPLETED`       | `FULFILMENT_CREATION_FAILED`      | Yes      | `FULFILMENT_OPERATIONS`       |
| `ORD-1044` | Fulfilment remains inside the expected processing window                   | `COMPLETE`    | `COMPLETED`       | `WITHIN_EXPECTED_PROCESSING_TIME` | No       | —                             |
| `ORD-1045` | Shipment-label creation failed                                             | `COMPLETE`    | `COMPLETED`       | `SHIPMENT_LABEL_CREATION_FAILED`  | Yes      | `SHIPPING_OPERATIONS`         |
| `ORD-1046` | Assigned-warehouse inventory evidence is absent                            | `MISSING`     | `NEEDS_MORE_INFO` | None                              | Yes      | `OPERATIONS_DATA_REVIEW`      |
| `ORD-1047` | A shipment already exists                                                  | `COMPLETE`    | `COMPLETED`       | `SHIPMENT_ALREADY_EXISTS`         | No       | —                             |
| `ORD-1048` | Complete evidence does not identify a supported cause                      | `COMPLETE`    | `COMPLETED`       | `CAUSE_NOT_DETERMINED`            | Yes      | `GENERAL_COMMERCE_OPERATIONS` |
| `ORD-1049` | Operator context says paid; authoritative payment source says `PROCESSING` | `COMPLETE`    | `COMPLETED`       | `PAYMENT_NOT_CONFIRMED`           | Yes      | `PAYMENT_OPERATIONS`          |
| `ORD-1050` | Two persisted inventory sources report conflicting quantities              | `CONFLICTING` | `NEEDS_MORE_INFO` | None                              | Yes      | `OPERATIONS_DATA_REVIEW`      |

`ORD-1044` and `ORD-1047` never escalate by default. `ORD-1046` and `ORD-1050` never receive a diagnosis.

## Starting commerce evidence

The seed contains only source evidence:

- nine orders and one item/payment per order;
- two active warehouses;
- source-specific inventory observations;
- current fulfilments where the scenario requires one;
- ordered fulfilment/progression/failure events;
- one existing shipment for `ORD-1047`.

No investigation, evidence snapshot, escalation, idempotency record, or audit event is seeded.

Missing evidence is absence, not a zero value. `ORD-1046` therefore has no observation for `WH-A/SKU-1046`.

Conflicting evidence is stored, not synthesized in memory. `ORD-1050` contains:

| Warehouse | SKU        | Source system      | Available |
| --------- | ---------- | ------------------ | --------- |
| `WH-A`    | `SKU-1050` | `WAREHOUSE_SYSTEM` | `0`       |
| `WH-A`    | `SKU-1050` | `COMMERCE_SYSTEM`  | `4`       |

## Fixed clock

Fixture reference time is `2026-07-30T12:00:00.000Z`, and the expected processing window is four hours.

- `ORD-1044` processing begins at `2026-07-30T10:30:00.000Z`, inside the window.
- `ORD-1048` processing begins at `2026-07-29T08:30:00.000Z`, outside the window.

Fixture construction never calls `Date.now()`.

## Seed and reset

Run:

```bash
bun run db:migrate
bun run db:seed
bun run db:verify-demo
bun run db:reset-demo
```

`db:seed` is for an empty migrated demo database. `db:reset-demo` is the explicit non-production helper for repeatable use: it removes only the approved demo records and workflow records derived from those orders, then restores the exact starting state in one transaction.

The current prototype uses the configured development/schema-owner credential for migration and explicit seed/reset. A dedicated seed/reset role and the read-only workflow-runtime role remain required before runtime database access is implemented.

Neither API startup nor any investigation automatically seeds or resets data.

## Safety boundary

Seed/reset is the only Phase 3 path that writes commerce data. It is an explicit non-production preparation path, not a runtime workflow capability.

The seed contains no operational fix: it does not reassign a warehouse, reserve inventory, release a hold, retry fulfilment, create a missing shipment, or change payment state.
