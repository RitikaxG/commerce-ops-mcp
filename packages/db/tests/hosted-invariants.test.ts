import { expect, test } from "bun:test";
import type { Client } from "pg";

import {
  connectDatabase,
  databaseAccessEnvironment,
  uniqueDatabaseId,
} from "./database-test-helpers.js";

interface WorkflowCounts {
  investigations: string;
  evidence: string;
  escalations: string;
  idempotency: string;
  audits: string;
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

async function workflowCounts(database: Client): Promise<WorkflowCounts> {
  const result = await database.query<WorkflowCounts>(
    `SELECT
      (SELECT count(*)::text FROM "operations"."investigations") AS investigations,
      (SELECT count(*)::text FROM "operations"."investigation_evidence") AS evidence,
      (SELECT count(*)::text FROM "operations"."human_review_escalations") AS escalations,
      (SELECT count(*)::text FROM "operations"."idempotency_records") AS idempotency,
      (SELECT count(*)::text FROM "operations"."audit_events") AS audits`,
  );

  const counts = result.rows[0];
  if (!counts) {
    throw new Error("Could not read hosted workflow counts");
  }
  return counts;
}

test("hosted verification transaction preserves existing workflow and commerce state", async () => {
  const database = await connectDatabase(databaseAccessEnvironment.databaseUrl);
  const commerceBefore = await commerceFingerprint(database);
  const workflowBefore = await workflowCounts(database);
  const investigationId = uniqueDatabaseId("HOSTED-VERIFY-INV");
  const traceId = uniqueDatabaseId("HOSTED-VERIFY-TRACE");
  const clientRequestId = uniqueDatabaseId("HOSTED-VERIFY-REQ");

  await database.query("BEGIN");

  try {
    await database.query(
      `INSERT INTO "operations"."investigations" (
        "id", "trace_id", "order_id", "client_request_id", "status",
        "evidence_status", "diagnosis_code", "confidence", "matched_rule",
        "suggested_queue", "suggested_next_step",
        "created_at", "updated_at", "completed_at"
      ) VALUES (
        $1, $2, 'ORD-1042', $3, 'COMPLETED',
        'COMPLETE', 'ASSIGNED_WAREHOUSE_OUT_OF_STOCK', 'CONFIRMED',
        'RULE-HOSTED-STATE-VERIFICATION', 'FULFILMENT_OPERATIONS',
        'Review warehouse reassignment with a human.',
        now(), now(), now()
      )`,
      [investigationId, traceId, clientRequestId],
    );
    await database.query(
      `INSERT INTO "operations"."investigation_evidence" (
        "investigation_id", "snapshot", "missing_fields", "conflicts",
        "source_observed_at", "created_at"
      ) VALUES ($1, '{}'::jsonb, ARRAY[]::text[], '[]'::jsonb, '{}'::jsonb, now())`,
      [investigationId],
    );
    await database.query(
      `INSERT INTO "operations"."audit_events" (
        "event_key", "trace_id", "investigation_id", "event_type",
        "status", "created_at"
      ) VALUES
        ($1, $3, $4, 'INVESTIGATION_STARTED', 'STARTED', now()),
        ($2, $3, $4, 'INVESTIGATION_PERSISTED', 'SUCCEEDED', now())`,
      [
        uniqueDatabaseId("HOSTED-VERIFY-EVENT-START"),
        uniqueDatabaseId("HOSTED-VERIFY-EVENT-END"),
        traceId,
        investigationId,
      ],
    );
    await database.query("SET CONSTRAINTS ALL IMMEDIATE");

    const inserted = await database.query<{
      investigations: string;
      evidence: string;
      audits: string;
    }>(
      `SELECT
        (SELECT count(*)::text FROM "operations"."investigations" WHERE "id" = $1) AS investigations,
        (SELECT count(*)::text FROM "operations"."investigation_evidence" WHERE "investigation_id" = $1) AS evidence,
        (SELECT count(*)::text FROM "operations"."audit_events" WHERE "investigation_id" = $1) AS audits`,
      [investigationId],
    );

    expect(inserted.rows[0]).toEqual({
      investigations: "1",
      evidence: "1",
      audits: "2",
    });
    expect(await commerceFingerprint(database)).toBe(commerceBefore);
  } finally {
    await database.query("ROLLBACK");
    await database.end();
  }

  const verification = await connectDatabase(
    databaseAccessEnvironment.databaseUrl,
  );

  try {
    expect(await commerceFingerprint(verification)).toBe(commerceBefore);
    expect(await workflowCounts(verification)).toEqual(workflowBefore);
  } finally {
    await verification.end();
  }
}, 90_000);
