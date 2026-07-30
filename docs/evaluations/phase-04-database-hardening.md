# Phase 04 Evaluation Report - Database Hardening

## Goal

Complete and prove the PostgreSQL safety boundary before runtime repositories
or evidence collection are introduced.

## Implementation completed

- Confirmed Phase 3 commit `7a0b39f` is merged to `main` by merge commit
  `13e4aaa`.
- Reverified the nine approved commerce cases and empty workflow tables.
- Added separate validated schema-owner, demo, and workflow database URLs.
- Moved explicit fixture writes to the dedicated `commerce_demo` connection.
- Added owner-only, idempotent role/grant setup with locally generated ignored
  credentials when requested.
- Added deferred cross-table constraints, immutable evidence, append-only audit,
  derived escalation validation, and polymorphic idempotency validation.
- Added table-driven live permission and invariant tests.
- Kept the Express API disconnected from PostgreSQL.

## Migrations

| Migration                                | Purpose                                                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `20260730183000_database_hardening`      | Adds the accepted invariant and immutability functions/triggers                                                    |
| `20260730184500_secure_trigger_wrappers` | Makes only trigger entry points run as their owner so restricted callers cannot execute private validation helpers |

The second additive migration was created after the first live restricted-role
test showed that a trigger wrapper called its revoked helper as the runtime
role. The already-applied migration was not rewritten.

## Connection and access decisions

| Connection / role                             | Allowed                                                                                                                     | Explicitly denied                                                                                                                 |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL` / schema owner                 | Migrations, role/grant setup, explicit verification                                                                         | Runtime application use                                                                                                           |
| `DEMO_DATABASE_URL` / `commerce_demo`         | `commerce` usage plus table `SELECT`, `INSERT`, `UPDATE`, `DELETE`                                                          | Operations access/writes, `TRUNCATE`, schema creation                                                                             |
| `WORKFLOW_DATABASE_URL` / `commerce_workflow` | Commerce `SELECT`; operations `SELECT`/`INSERT`; approved investigation lifecycle/result column updates; audit sequence use | Every commerce mutation; evidence/audit/idempotency mutation; case updates; schema creation; direct validation-function execution |

Credentials are absent from committed files. `db:setup-access:local` writes
generated role URLs only to ignored `packages/db/.env`. The setup command does
not run during API startup.

Neon permits the owner connection to create roles but rejects later password
rotation for those child roles. Idempotent setup therefore leaves existing
credentials unchanged, reapplies grants, and verifies both restricted logins.
Live permission verification is not blocked.

## Invariants verified

- `COMPLETED` requires exactly one complete evidence snapshot with no missing
  fields or conflicts and a complete persisted diagnosis.
- `NEEDS_MORE_INFO` requires exactly one snapshot and explicit missing fields or
  structured conflicts with no diagnosis.
- Evidence rejects updates and deletions.
- Audit events reject updates and deletions.
- Escalations must match the investigation order, human-action queue, reason,
  and stored suggested next step.
- Idempotency records must point to an existing resource of the declared type.
- One valid investigation/evidence/audit transaction succeeds and rolls back
  without changing commerce data.

## Automated checks

| Command                                            | Actual                                                                   | Result |
| -------------------------------------------------- | ------------------------------------------------------------------------ | ------ |
| `bun install --frozen-lockfile`                    | 535 installs checked across 629 packages; no changes                     | Pass   |
| `bun run db:generate`                              | Prisma Client 7.9.1 generated                                            | Pass   |
| `bun --bun run prisma validate`                    | Prisma schema valid                                                      | Pass   |
| `bun run db:migrate`                               | Both Phase 4 additive migrations applied                                 | Pass   |
| `bun run db:setup-access:local`                    | Created and connected as `commerce_demo` and `commerce_workflow`         | Pass   |
| `bun run db:setup-access`                          | Existing roles reused, grants reapplied, both logins verified            | Pass   |
| `bun run db:verify-access`                         | 6 tests, 68 assertions on final package run                              | Pass   |
| `bun run --filter @repo/fixtures test:integration` | 1 test, 8 assertions through `commerce_demo`                             | Pass   |
| `bun run --filter @repo/db test`                   | 6 tests, 68 assertions                                                   | Pass   |
| `bun run build`                                    | 14 successful Turbo tasks                                                | Pass   |
| `bun run typecheck`                                | 14 successful Turbo tasks                                                | Pass   |
| `bun run test`                                     | 18 successful Turbo tasks; config 10/10, DB 6/6, fixtures 30/30, API 1/1 | Pass   |
| `bun run lint`                                     | 2 successful Turbo tasks                                                 | Pass   |
| `bun run db:verify-demo`                           | Approved counts and zero workflow rows                                   | Pass   |
| Formatting and `git diff --check`                  | No errors                                                                | Pass   |

## Diagnostics retained

- The Phase 3 handoff integration test passed cleanly before implementation in
  21.2 seconds, so no initial timeout change was made.
- The first dedicated-demo-role run reproduced Prisma `P2028` while acquiring
  an interactive transaction. A demo-only 15-second acquisition window and
  30-second transaction timeout resolved it.
- The next run progressed but exceeded the old 30-second Bun test ceiling. The
  integration-only ceiling is now 90 seconds; the final focused run passed in
  33.8 seconds.
- The first workflow permission run failed because a revoked helper ran under
  the restricted user. A second additive migration made only trigger wrappers
  `SECURITY DEFINER`; the final live matrix passed.
- The first idempotent setup rerun showed Neon allows role creation but rejects
  later `ALTER ROLE` password rotation through this owner. Existing roles are
  now reused and login-verified.
- The first root test ran DB invariants concurrently with fixture reset and hit
  a transient order foreign-key gap. Turbo now honors `^test`, so `@repo/db`
  completes before dependent `@repo/fixtures`; the final root run passed 18/18.

## Approved data after verification

| Area       | Counts                                                                                                      |
| ---------- | ----------------------------------------------------------------------------------------------------------- |
| Commerce   | 9 orders, 9 items, 9 payments, 2 warehouses, 8 inventory observations, 7 fulfilments, 14 events, 1 shipment |
| Operations | 0 investigations, 0 evidence snapshots, 0 escalations, 0 idempotency records, 0 audit events                |

## Files changed

### Root and configuration

- `.env.example`
- `package.json`
- `turbo.json`
- `packages/config/env.ts`
- `packages/config/index.ts`
- `packages/config/tests/env.test.ts`

### Database package

- `packages/db/client.ts`
- `packages/db/demo-data.ts`
- `packages/db/package.json`
- `packages/db/tsconfig.json`
- `packages/db/tsconfig.build.json`
- `packages/db/scripts/setup-access.ts`
- `packages/db/sql/access-control.sql`
- `packages/db/tests/database-test-helpers.ts`
- `packages/db/tests/permissions.test.ts`
- `packages/db/tests/invariants.test.ts`
- `packages/db/prisma/migrations/20260730183000_database_hardening/migration.sql`
- `packages/db/prisma/migrations/20260730184500_secure_trigger_wrappers/migration.sql`

### Phase 3 handoff correction

- `packages/fixtures/tests/database.test.ts`

### Documentation

- `AGENTS.md`
- `README.md`
- `docs/evaluations/phase-04-database-hardening.md`

## Remaining limitations

- Runtime repository interfaces and a workflow Prisma client remain Phase 5;
  the API does not connect to PostgreSQL.
- A separate reviewer role/interface remains optional and out of scope.
- Existing Neon child-role passwords cannot be rotated by this owner command;
  supply provider-authorized credentials for rotation when needed.
- The setup script intentionally targets the fixed prototype role names
  `commerce_demo` and `commerce_workflow`.

## Proposed commit

`feat(db): enforce runtime database safety boundary`

No commit or push was performed.

## Exit decision

Awaiting review.
