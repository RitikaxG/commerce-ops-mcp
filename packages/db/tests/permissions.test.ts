import { expect, test } from "bun:test";

import {
  connectDatabase,
  databaseAccessEnvironment,
  expectDatabaseError,
  expectSavepointError,
  uniqueDatabaseId,
} from "./database-test-helpers.js";

test("workflow role enforces the commerce and operations permission matrix", async () => {
  const database = await connectDatabase(
    databaseAccessEnvironment.workflowDatabaseUrl,
  );
  const investigationId = uniqueDatabaseId("PERM-INV");
  const traceId = uniqueDatabaseId("PERM-TRACE");
  const clientRequestId = uniqueDatabaseId("PERM-REQ");
  const escalationId = uniqueDatabaseId("PERM-CASE");
  const eventKey = uniqueDatabaseId("PERM-EVENT");
  const idempotencyKey = uniqueDatabaseId("PERM-IDEM");
  const now = new Date().toISOString();

  try {
    const identity = await database.query<{ current_user: string }>(
      "SELECT current_user",
    );
    expect(identity.rows[0]?.current_user).toBe("commerce_workflow");

    const commerceRead = await database.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM "commerce"."orders"',
    );
    expect(Number(commerceRead.rows[0]?.count)).toBeGreaterThanOrEqual(9);

    const forbiddenCommerceStatements = [
      `INSERT INTO "commerce"."orders" ("id", "status", "created_at", "updated_at") VALUES ('${uniqueDatabaseId("DENIED-ORDER")}', 'CONFIRMED', now(), now())`,
      `UPDATE "commerce"."orders" SET "updated_at" = now() WHERE "id" = 'ORD-1042'`,
      `DELETE FROM "commerce"."orders" WHERE "id" = 'ORD-1042'`,
      'TRUNCATE TABLE "commerce"."payments"',
    ];

    for (const statement of forbiddenCommerceStatements) {
      await expectDatabaseError(database.query(statement), "42501");
    }

    await expectDatabaseError(
      database.query('CREATE SCHEMA "workflow_forbidden_schema"'),
      "42501",
    );
    await expectDatabaseError(
      database.query(
        `SELECT "operations"."validate_terminal_investigation"('${investigationId}')`,
      ),
      "42501",
    );

    await database.query("BEGIN");
    await database.query(
      `INSERT INTO "operations"."investigations" (
          "id", "trace_id", "order_id", "client_request_id", "status",
          "created_at", "updated_at"
        ) VALUES ($1, $2, 'ORD-1042', $3, 'RUNNING', $4, $4)`,
      [investigationId, traceId, clientRequestId, now],
    );
    await database.query(
      `UPDATE "operations"."investigations"
        SET
          "status" = 'COMPLETED',
          "evidence_status" = 'COMPLETE',
          "diagnosis_code" = 'ASSIGNED_WAREHOUSE_OUT_OF_STOCK',
          "confidence" = 'CONFIRMED',
          "matched_rule" = 'RULE-PERMISSION-TEST',
          "suggested_queue" = 'FULFILMENT_OPERATIONS',
          "suggested_next_step" = 'Review warehouse reassignment with a human.',
          "completed_at" = $2,
          "updated_at" = $2
        WHERE "id" = $1`,
      [investigationId, now],
    );
    await database.query(
      `INSERT INTO "operations"."investigation_evidence" (
          "investigation_id", "snapshot", "missing_fields", "conflicts",
          "source_observed_at", "created_at"
        ) VALUES ($1, '{}'::jsonb, ARRAY[]::text[], '[]'::jsonb, '{}'::jsonb, $2)`,
      [investigationId, now],
    );
    await database.query(
      `INSERT INTO "operations"."audit_events" (
          "event_key", "trace_id", "investigation_id", "event_type",
          "status", "created_at"
        ) VALUES ($1, $2, $3, 'INVESTIGATION_STARTED', 'STARTED', $4)`,
      [eventKey, traceId, investigationId, now],
    );
    await database.query(
      `INSERT INTO "operations"."idempotency_records" (
          "tool_name", "idempotency_key", "request_hash", "resource_type",
          "resource_id", "response_snapshot", "created_at"
        ) VALUES (
          'investigate_order_exception', $1, $2, 'INVESTIGATION',
          $3, '{}'::jsonb, $4
        )`,
      [idempotencyKey, "a".repeat(64), investigationId, now],
    );
    await database.query(
      `INSERT INTO "operations"."human_review_escalations" (
          "id", "investigation_id", "order_id", "status", "queue",
          "reason_code", "suggested_next_step", "dedupe_key",
          "created_at", "updated_at"
        ) VALUES (
          $1, $2, 'ORD-1042', 'AWAITING_REVIEW', 'FULFILMENT_OPERATIONS',
          'ASSIGNED_WAREHOUSE_OUT_OF_STOCK',
          'Review warehouse reassignment with a human.',
          $3, $4, $4
        )`,
      [escalationId, investigationId, escalationId, now],
    );

    const forbiddenWorkflowMutations = [
      {
        name: "evidence_update",
        statement: `UPDATE "operations"."investigation_evidence" SET "snapshot" = '{"changed":true}'::jsonb WHERE "investigation_id" = '${investigationId}'`,
      },
      {
        name: "evidence_delete",
        statement: `DELETE FROM "operations"."investigation_evidence" WHERE "investigation_id" = '${investigationId}'`,
      },
      {
        name: "audit_update",
        statement: `UPDATE "operations"."audit_events" SET "status" = 'SUCCEEDED' WHERE "event_key" = '${eventKey}'`,
      },
      {
        name: "audit_delete",
        statement: `DELETE FROM "operations"."audit_events" WHERE "event_key" = '${eventKey}'`,
      },
      {
        name: "idempotency_update",
        statement: `UPDATE "operations"."idempotency_records" SET "request_hash" = '${"b".repeat(64)}' WHERE "idempotency_key" = '${idempotencyKey}'`,
      },
      {
        name: "idempotency_delete",
        statement: `DELETE FROM "operations"."idempotency_records" WHERE "idempotency_key" = '${idempotencyKey}'`,
      },
      {
        name: "escalation_update",
        statement: `UPDATE "operations"."human_review_escalations" SET "status" = 'IN_REVIEW' WHERE "id" = '${escalationId}'`,
      },
      {
        name: "investigation_order_update",
        statement: `UPDATE "operations"."investigations" SET "order_id" = 'ORD-1043' WHERE "id" = '${investigationId}'`,
      },
    ];

    for (const mutation of forbiddenWorkflowMutations) {
      await expectSavepointError(
        database,
        mutation.name,
        mutation.statement,
        "42501",
      );
    }

    await database.query("SET CONSTRAINTS ALL IMMEDIATE");

    const inserted = await database.query<{ investigations: string }>(
      `SELECT count(*)::text AS investigations
        FROM "operations"."investigations"
        WHERE "id" = $1`,
      [investigationId],
    );
    expect(inserted.rows[0]?.investigations).toBe("1");
  } finally {
    await database.query("ROLLBACK").catch(() => undefined);
    await database.end();
  }
}, 60_000);

test("demo role can manage commerce fixtures but cannot write workflow data", async () => {
  const database = await connectDatabase(
    databaseAccessEnvironment.demoDatabaseUrl,
  );

  try {
    const privileges = await database.query<{
      current_user: string;
      can_select: boolean;
      can_insert: boolean;
      can_update: boolean;
      can_delete: boolean;
      can_truncate: boolean;
      operations_usage: boolean;
    }>(
      `SELECT
          current_user,
          has_table_privilege(current_user, 'commerce.orders', 'SELECT') AS can_select,
          has_table_privilege(current_user, 'commerce.orders', 'INSERT') AS can_insert,
          has_table_privilege(current_user, 'commerce.orders', 'UPDATE') AS can_update,
          has_table_privilege(current_user, 'commerce.orders', 'DELETE') AS can_delete,
          has_table_privilege(current_user, 'commerce.orders', 'TRUNCATE') AS can_truncate,
          has_schema_privilege(current_user, 'operations', 'USAGE') AS operations_usage`,
    );

    expect(privileges.rows[0]).toEqual({
      current_user: "commerce_demo",
      can_select: true,
      can_insert: true,
      can_update: true,
      can_delete: true,
      can_truncate: false,
      operations_usage: false,
    });

    await expectDatabaseError(
      database.query(
        `INSERT INTO "operations"."investigations" (
            "id", "trace_id", "order_id", "client_request_id",
            "status", "created_at", "updated_at"
          ) VALUES (
            '${uniqueDatabaseId("DENIED-DEMO-INV")}',
            '${uniqueDatabaseId("DENIED-DEMO-TRACE")}',
            'ORD-1042',
            '${uniqueDatabaseId("DENIED-DEMO-REQ")}',
            'RUNNING',
            now(),
            now()
          )`,
      ),
      "42501",
    );
    await expectDatabaseError(
      database.query('CREATE SCHEMA "demo_forbidden_schema"'),
      "42501",
    );
  } finally {
    await database.end();
  }
}, 30_000);
