# Phase 05 Evaluation Report - Read-Only Commerce Repositories

## Goal

Expose the source reads required by the future evidence collector through a
small typed repository boundary backed only by the restricted workflow
connection.

## Implemented repository surface

`@repo/db` now exports:

- `CommerceReadRepository`
- `CommerceRepositoryContext`
- `createWorkflowRepositoryContext()`

The facade supports order lookup, ordered order items, current
payment/fulfilment/shipment lookup, ordered fulfilment events, inventory
observations for requested SKUs, and warehouses for requested IDs. The context
owns one internal Prisma client and exposes explicit asynchronous cleanup.

`@repo/schemas` exports Zod schemas and inferred plain-record types for each
commerce source. No public repository type refers to Prisma.

## Important mapping and query decisions

- Runtime construction parses only `WORKFLOW_DATABASE_URL`; there is no owner
  or demo URL fallback.
- Queries select explicit columns and return Zod-validated plain values.
- Timestamps become ISO-8601 strings, payment amounts become two-decimal
  strings, nullable references remain null, and event details must be valid
  JSON values.
- Unknown singular records return `null`; absent collections return `[]`.
- Items order by SKU then ID; events by occurrence time then ID; inventory by
  warehouse, SKU, then native source-system enum order; warehouses by ID.
- Inventory lookup does not filter, aggregate, default, or classify
  observations. Inactive warehouses would remain visible.
- No generic query, commerce mutation, operations repository, evidence
  normalization, readiness, diagnosis, or escalation behavior was added.

## Focused test results

| Command / check                     | Actual                                                                           | Result |
| ----------------------------------- | -------------------------------------------------------------------------------- | ------ |
| `bun install --frozen-lockfile`     | 535 installs checked across 629 packages; no changes                             | Pass   |
| `bun run db:verify-demo`            | Approved commerce counts; all five operations counts zero                        | Pass   |
| `bun run db:verify-access`          | 6 tests, 68 assertions                                                           | Pass   |
| Focused repository integration test | 1 test, 36 assertions through the restricted workflow role                       | Pass   |
| `bun run --filter @repo/db test`    | 7 tests, 104 assertions                                                          | Pass   |
| `bun run build`                     | 14 successful Turbo tasks                                                        | Pass   |
| `bun run typecheck`                 | 14 successful Turbo tasks                                                        | Pass   |
| `bun run test`                      | 18 successful tasks; DB 7/7, fixtures 30/30, config 10/10, API 1/1               | Pass   |
| `bun run lint`                      | 2 successful Turbo tasks                                                         | Pass   |
| Public declaration inspection       | Repository declarations contain only public schema record types; no Prisma types | Pass   |

## Representative read results

| Order      | Repository evidence                                                                                                     |
| ---------- | ----------------------------------------------------------------------------------------------------------------------- |
| `ORD-1042` | Fulfilment `FUL-1042` is `ON_HOLD` at `WH-A`; `SKU-1042` observations are `WH-A=0` and `WH-B=3`; shipment is `null`     |
| `ORD-1046` | Fulfilment remains assigned to `WH-A`; `SKU-1046` observations are `[]`, not a zero-quantity record; shipment is `null` |
| `ORD-1050` | Both persisted `WH-A/SKU-1050` observations are returned: `WAREHOUSE_SYSTEM=0` and `COMMERCE_SYSTEM=4`                  |

These are source records only. The repository does not label evidence as
complete, missing, or conflicting and does not produce a diagnosis.

## Commerce data remained unchanged

The integration test fingerprints row counts and full row values for all eight
commerce tables before and after repeated reads through the repository. The
fingerprints matched. Final verification retained 9 orders, 9 items, 9
payments, 2 warehouses, 8 inventory observations, 7 fulfilments, 14 events,
and 1 shipment, with all operations tables empty.

## Known limitations

- Evidence aggregation and normalization begin in Phase 6.
- Source-read timeout/error representation is not part of this repository
  contract yet.
- Operations repositories and workflow persistence remain deferred.
- The Express API does not construct a repository context or connect to
  PostgreSQL.
- Hosted integration checks require network access to the configured database.

## Files changed

### Schemas

- `packages/schemas/commerce-records.ts`
- `packages/schemas/index.ts`

### Database

- `packages/db/client.ts`
- `packages/db/commerce-repository.ts`
- `packages/db/index.ts`
- `packages/db/tests/commerce-repository.test.ts`

### Documentation

- `AGENTS.md`
- `README.md`
- `docs/architecture/package-graph.md`
- `docs/evaluations/phase-05-readonly-commerce-repositories.md`

## Proposed commit

`feat(db): add read-only commerce repositories`

## Exit decision

Accepted and merged to `main` as commit `1ad80d2` on 2026-07-30.
