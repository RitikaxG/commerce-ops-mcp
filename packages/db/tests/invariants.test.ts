import { expect, test } from "bun:test";
import type { Client } from "pg";

import {
  connectDatabase,
  databaseAccessEnvironment,
  expectDatabaseError,
  uniqueDatabaseId,
} from "./database-test-helpers.js";

interface InvestigationIds {
  investigationId: string;
  traceId: string;
  clientRequestId: string;
}

function investigationIds(prefix: string): InvestigationIds {
  return {
    investigationId: uniqueDatabaseId(`${prefix}-INV`),
    traceId: uniqueDatabaseId(`${prefix}-TRACE`),
    clientRequestId: uniqueDatabaseId(`${prefix}-REQ`),
  };
}

async function insertCompletedInvestigation(
  database: Client,
  ids: InvestigationIds,
): Promise<void> {
  await database.query(
    `INSERT INTO "operations"."investigations" (
      "id", "trace_id", "order_id", "client_request_id", "status",
      "evidence_status", "diagnosis_code", "confidence", "matched_rule",
      "suggested_queue", "suggested_next_step",
      "created_at", "updated_at", "completed_at"
    ) VALUES (
      $1, $2, 'ORD-1042', $3, 'COMPLETED',
      'COMPLETE', 'ASSIGNED_WAREHOUSE_OUT_OF_STOCK', 'CONFIRMED',
      'RULE-DATABASE-HARDENING', 'FULFILMENT_OPERATIONS',
      'Review warehouse reassignment with a human.',
      now(), now(), now()
    )`,
    [ids.investigationId, ids.traceId, ids.clientRequestId],
  );
}

async function insertNeedsMoreInfoInvestigation(
  database: Client,
  ids: InvestigationIds,
  evidenceStatus: "MISSING" | "CONFLICTING",
): Promise<void> {
  await database.query(
    `INSERT INTO "operations"."investigations" (
      "id", "trace_id", "order_id", "client_request_id", "status",
      "evidence_status", "suggested_queue", "suggested_next_step",
      "created_at", "updated_at", "completed_at"
    ) VALUES (
      $1, $2, 'ORD-1046', $3, 'NEEDS_MORE_INFO',
      $4, 'OPERATIONS_DATA_REVIEW',
      'Verify current evidence before deciding an operational action.',
      now(), now(), now()
    )`,
    [ids.investigationId, ids.traceId, ids.clientRequestId, evidenceStatus],
  );
}

async function insertEvidence(
  database: Client,
  investigationId: string,
  missingFields: readonly string[] = [],
  conflicts: readonly unknown[] = [],
): Promise<void> {
  await database.query(
    `INSERT INTO "operations"."investigation_evidence" (
      "investigation_id", "snapshot", "missing_fields", "conflicts",
      "source_observed_at", "created_at"
    ) VALUES ($1, '{}'::jsonb, $2::text[], $3::jsonb, '{}'::jsonb, now())`,
    [investigationId, [...missingFields], JSON.stringify(conflicts)],
  );
}

async function expectDeferredViolation(
  database: Client,
  arrange: () => Promise<void>,
  code: string | readonly string[] = ["23514", "23503"],
): Promise<void> {
  await database.query("BEGIN");

  try {
    await arrange();
    await expectDatabaseError(
      database.query("SET CONSTRAINTS ALL IMMEDIATE"),
      code,
    );
  } finally {
    await database.query("ROLLBACK");
  }
}

async function commerceFingerprint(database: Client): Promise<string> {
  const tables = [
    "orders",
    "order_items",
    "payments",
    "warehouses",
    "inventory_levels",
    "fulfilments",
    "fulfilment_events",
    "shipments",
  ] as const;
  const fingerprints: string[] = [];

  for (const table of tables) {
    const result = await database.query<{ fingerprint: string }>(
      `SELECT md5(
        COALESCE(
          string_agg(row_to_json(record)::text, '|' ORDER BY row_to_json(record)::text),
          ''
        )
      ) AS fingerprint
      FROM "commerce"."${table}" AS record`,
    );
    fingerprints.push(`${table}:${result.rows[0]?.fingerprint}`);
  }

  return fingerprints.join("|");
}

test("deferred terminal evidence invariants reject incomplete or contradictory records", async () => {
  const database = await connectDatabase(databaseAccessEnvironment.databaseUrl);

  try {
    const invalidCases = [
      {
        name: "completed without evidence",
        arrange: async () => {
          await insertCompletedInvestigation(
            database,
            investigationIds("NO-EVIDENCE"),
          );
        },
      },
      {
        name: "completed with missing fields",
        arrange: async () => {
          const ids = investigationIds("COMPLETED-MISSING");
          await insertCompletedInvestigation(database, ids);
          await insertEvidence(database, ids.investigationId, [
            "inventory.assignedWarehouse",
          ]);
        },
      },
      {
        name: "completed with conflicts",
        arrange: async () => {
          const ids = investigationIds("COMPLETED-CONFLICT");
          await insertCompletedInvestigation(database, ids);
          await insertEvidence(
            database,
            ids.investigationId,
            [],
            [{ field: "inventory.availableQuantity" }],
          );
        },
      },
      {
        name: "missing without missing fields",
        arrange: async () => {
          const ids = investigationIds("MISSING-EMPTY");
          await insertNeedsMoreInfoInvestigation(database, ids, "MISSING");
          await insertEvidence(database, ids.investigationId);
        },
      },
      {
        name: "conflicting without conflicts",
        arrange: async () => {
          const ids = investigationIds("CONFLICT-EMPTY");
          await insertNeedsMoreInfoInvestigation(database, ids, "CONFLICTING");
          await insertEvidence(database, ids.investigationId);
        },
      },
      {
        name: "conflicting with an unstructured conflict",
        arrange: async () => {
          const ids = investigationIds("CONFLICT-UNSTRUCTURED");
          await insertNeedsMoreInfoInvestigation(database, ids, "CONFLICTING");
          await insertEvidence(
            database,
            ids.investigationId,
            [],
            ["not-an-object"],
          );
        },
      },
    ];

    for (const invalidCase of invalidCases) {
      await expectDeferredViolation(database, invalidCase.arrange, "23514");
    }
  } finally {
    await database.end();
  }
}, 90_000);

test("evidence and audit records reject updates and deletions", async () => {
  const database = await connectDatabase(databaseAccessEnvironment.databaseUrl);

  try {
    for (const operation of ["UPDATE", "DELETE"] as const) {
      await database.query("BEGIN");

      try {
        const ids = investigationIds(`IMMUTABLE-EVIDENCE-${operation}`);
        await database.query(
          `INSERT INTO "operations"."investigations" (
              "id", "trace_id", "order_id", "client_request_id",
              "status", "created_at", "updated_at"
            ) VALUES ($1, $2, 'ORD-1042', $3, 'RUNNING', now(), now())`,
          [ids.investigationId, ids.traceId, ids.clientRequestId],
        );
        await insertEvidence(database, ids.investigationId);
        const statement =
          operation === "UPDATE"
            ? `UPDATE "operations"."investigation_evidence" SET "snapshot" = '{"changed":true}'::jsonb WHERE "investigation_id" = $1`
            : `DELETE FROM "operations"."investigation_evidence" WHERE "investigation_id" = $1`;
        await expectDatabaseError(
          database.query(statement, [ids.investigationId]),
          "55000",
        );
      } finally {
        await database.query("ROLLBACK");
      }
    }

    for (const operation of ["UPDATE", "DELETE"] as const) {
      await database.query("BEGIN");

      try {
        const ids = investigationIds(`APPEND-AUDIT-${operation}`);
        const eventKey = uniqueDatabaseId("APPEND-EVENT");
        await database.query(
          `INSERT INTO "operations"."investigations" (
              "id", "trace_id", "order_id", "client_request_id",
              "status", "created_at", "updated_at"
            ) VALUES ($1, $2, 'ORD-1042', $3, 'RUNNING', now(), now())`,
          [ids.investigationId, ids.traceId, ids.clientRequestId],
        );
        await database.query(
          `INSERT INTO "operations"."audit_events" (
              "event_key", "trace_id", "investigation_id", "event_type",
              "status", "created_at"
            ) VALUES ($1, $2, $3, 'INVESTIGATION_STARTED', 'STARTED', now())`,
          [eventKey, ids.traceId, ids.investigationId],
        );
        const statement =
          operation === "UPDATE"
            ? `UPDATE "operations"."audit_events" SET "status" = 'SUCCEEDED' WHERE "event_key" = $1`
            : `DELETE FROM "operations"."audit_events" WHERE "event_key" = $1`;
        await expectDatabaseError(
          database.query(statement, [eventKey]),
          "55000",
        );
      } finally {
        await database.query("ROLLBACK");
      }
    }
  } finally {
    await database.end();
  }
}, 90_000);

test("escalation and idempotency records must match persisted resources", async () => {
  const database = await connectDatabase(databaseAccessEnvironment.databaseUrl);

  try {
    for (const mismatch of ["order", "reason"] as const) {
      await expectDeferredViolation(database, async () => {
        const ids = investigationIds(`ESCALATION-${mismatch}`);
        await insertCompletedInvestigation(database, ids);
        await insertEvidence(database, ids.investigationId);
        await database.query(
          `INSERT INTO "operations"."human_review_escalations" (
              "id", "investigation_id", "order_id", "status", "queue",
              "reason_code", "suggested_next_step", "dedupe_key",
              "created_at", "updated_at"
            ) VALUES (
              $1, $2, $3, 'AWAITING_REVIEW', 'FULFILMENT_OPERATIONS',
              $4, 'Review warehouse reassignment with a human.',
              $1, now(), now()
            )`,
          [
            uniqueDatabaseId("INVALID-CASE"),
            ids.investigationId,
            mismatch === "order" ? "ORD-1043" : "ORD-1042",
            mismatch === "reason"
              ? "CAUSE_NOT_DETERMINED"
              : "ASSIGNED_WAREHOUSE_OUT_OF_STOCK",
          ],
        );
      });
    }

    await expectDeferredViolation(
      database,
      async () => {
        await database.query(
          `INSERT INTO "operations"."idempotency_records" (
              "tool_name", "idempotency_key", "request_hash", "resource_type",
              "resource_id", "response_snapshot", "created_at"
            ) VALUES (
              'investigate_order_exception', $1, $2, 'INVESTIGATION',
              $3, '{}'::jsonb, now()
            )`,
          [
            uniqueDatabaseId("MISSING-IDEMPOTENCY"),
            "c".repeat(64),
            uniqueDatabaseId("MISSING-INV"),
          ],
        );
      },
      "23503",
    );

    await expectDeferredViolation(
      database,
      async () => {
        const ids = investigationIds("MISMATCHED-IDEMPOTENCY");
        await database.query(
          `INSERT INTO "operations"."investigations" (
              "id", "trace_id", "order_id", "client_request_id",
              "status", "created_at", "updated_at"
            ) VALUES ($1, $2, 'ORD-1042', $3, 'RUNNING', now(), now())`,
          [ids.investigationId, ids.traceId, ids.clientRequestId],
        );
        await database.query(
          `INSERT INTO "operations"."idempotency_records" (
              "tool_name", "idempotency_key", "request_hash", "resource_type",
              "resource_id", "response_snapshot", "created_at"
            ) VALUES (
              'create_human_review_escalation', $1, $2,
              'HUMAN_REVIEW_ESCALATION', $3, '{}'::jsonb, now()
            )`,
          [
            uniqueDatabaseId("MISMATCHED-IDEMPOTENCY"),
            "d".repeat(64),
            ids.investigationId,
          ],
        );
      },
      "23503",
    );
  } finally {
    await database.end();
  }
}, 90_000);

test("one valid operations transaction leaves commerce unchanged", async () => {
  const database = await connectDatabase(databaseAccessEnvironment.databaseUrl);
  const before = await commerceFingerprint(database);
  const ids = investigationIds("VALID");

  await database.query("BEGIN");

  try {
    await insertCompletedInvestigation(database, ids);
    await insertEvidence(database, ids.investigationId);
    await database.query(
      `INSERT INTO "operations"."audit_events" (
          "event_key", "trace_id", "investigation_id", "event_type",
          "status", "created_at"
        ) VALUES
          ($1, $3, $4, 'INVESTIGATION_STARTED', 'STARTED', now()),
          ($2, $3, $4, 'INVESTIGATION_PERSISTED', 'SUCCEEDED', now())`,
      [
        uniqueDatabaseId("VALID-EVENT-START"),
        uniqueDatabaseId("VALID-EVENT-END"),
        ids.traceId,
        ids.investigationId,
      ],
    );
    await database.query("SET CONSTRAINTS ALL IMMEDIATE");

    const persisted = await database.query<{
      investigations: string;
      evidence: string;
      audits: string;
    }>(
      `SELECT
          (SELECT count(*)::text FROM "operations"."investigations" WHERE "id" = $1) AS investigations,
          (SELECT count(*)::text FROM "operations"."investigation_evidence" WHERE "investigation_id" = $1) AS evidence,
          (SELECT count(*)::text FROM "operations"."audit_events" WHERE "investigation_id" = $1) AS audits`,
      [ids.investigationId],
    );
    expect(persisted.rows[0]).toEqual({
      investigations: "1",
      evidence: "1",
      audits: "2",
    });
    expect(await commerceFingerprint(database)).toBe(before);
  } finally {
    await database.query("ROLLBACK");
    await database.end();
  }

  const verification = await connectDatabase(
    databaseAccessEnvironment.databaseUrl,
  );

  try {
    expect(await commerceFingerprint(verification)).toBe(before);
    const workflowRows = await verification.query<{
      investigations: string;
      evidence: string;
      escalations: string;
      idempotency: string;
      audits: string;
    }>(
      `SELECT
          (SELECT count(*)::text FROM "operations"."investigations") AS investigations,
          (SELECT count(*)::text FROM "operations"."investigation_evidence") AS evidence,
          (SELECT count(*)::text FROM "operations"."human_review_escalations") AS escalations,
          (SELECT count(*)::text FROM "operations"."idempotency_records") AS idempotency,
          (SELECT count(*)::text FROM "operations"."audit_events") AS audits`,
    );
    expect(workflowRows.rows[0]).toEqual({
      investigations: "0",
      evidence: "0",
      escalations: "0",
      idempotency: "0",
      audits: "0",
    });
  } finally {
    await verification.end();
  }
}, 90_000);
