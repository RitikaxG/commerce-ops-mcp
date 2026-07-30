import { afterAll, beforeAll, expect, test } from "bun:test";

import { createWorkflowRepositoryContext } from "../index.js";
import {
  getWorkflowDemoRecordCounts,
  resetWorkflowDemoData,
} from "../testing.js";

const AT = "2026-07-30T12:00:00.000Z";

beforeAll(async () => {
  await resetWorkflowDemoData();
});

afterAll(async () => {
  await resetWorkflowDemoData();
});

test("blocks workflow demo cleanup in production", async () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    await expect(resetWorkflowDemoData()).rejects.toThrow(
      "Workflow demo cleanup is disabled",
    );
  } finally {
    if (previous === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previous;
    }
  }
});

function failureCommand(input: {
  investigationId: string;
  traceId: string;
  clientRequestId: string;
  idempotencyKey: string;
  duplicateAuditKeys?: boolean;
}) {
  const firstEventKey = `AUDIT-${input.investigationId}-1`;
  return {
    result: {
      schemaVersion: 1 as const,
      investigationId: input.investigationId,
      traceId: input.traceId,
      clientRequestId: input.clientRequestId,
      orderId: "ORD-1042",
      status: "FAILED" as const,
      errorCode: "WORKFLOW_EXECUTION_FAILED" as const,
      createdAt: AT,
      completedAt: AT,
      commerceStateChanged: false as const,
    },
    auditEvents: [
      {
        eventKey: firstEventKey,
        traceId: input.traceId,
        investigationId: input.investigationId,
        reviewCaseId: null,
        eventType: "INVESTIGATION_FAILED" as const,
        toolName: "investigate_order_exception",
        status: "FAILED" as const,
        safeInputSummary: { orderId: "ORD-1042" },
        safeOutputSummary: { commerceStateChanged: false },
        errorCode: "WORKFLOW_EXECUTION_FAILED",
        durationMs: null,
        createdAt: AT,
      },
      {
        eventKey: input.duplicateAuditKeys
          ? firstEventKey
          : `AUDIT-${input.investigationId}-2`,
        traceId: input.traceId,
        investigationId: input.investigationId,
        reviewCaseId: null,
        eventType: "TOOL_CALL_FAILED" as const,
        toolName: "investigate_order_exception",
        status: "FAILED" as const,
        safeInputSummary: null,
        safeOutputSummary: { commerceStateChanged: false },
        errorCode: "WORKFLOW_EXECUTION_FAILED",
        durationMs: null,
        createdAt: AT,
      },
    ],
    idempotencyKey: input.idempotencyKey,
    requestHash: "a".repeat(64),
  };
}

test("rolls back the entire investigation bundle when an audit insert conflicts", async () => {
  const context = createWorkflowRepositoryContext();
  try {
    const command = failureCommand({
      investigationId: "INV-ROLLBACK",
      traceId: "TRACE-ROLLBACK",
      clientRequestId: "REQ-ROLLBACK",
      idempotencyKey: "IDEM-ROLLBACK",
      duplicateAuditKeys: true,
    });
    const outcome =
      await context.operations.persistInvestigationFailure(command);

    expect(outcome.kind).toBe("UNIQUE_CONFLICT");
    expect(
      await context.operations.findInvestigationById("INV-ROLLBACK"),
    ).toBeNull();
    expect(await getWorkflowDemoRecordCounts()).toEqual({
      investigations: 0,
      investigationEvidence: 0,
      humanReviewEscalations: 0,
      idempotencyRecords: 0,
      auditEvents: 0,
    });
  } finally {
    await context.disconnect();
  }
});

test("commits exactly one logical effect for concurrent identical commands", async () => {
  const context = createWorkflowRepositoryContext();
  try {
    const command = failureCommand({
      investigationId: "INV-CONCURRENT",
      traceId: "TRACE-CONCURRENT",
      clientRequestId: "REQ-CONCURRENT",
      idempotencyKey: "IDEM-CONCURRENT",
    });
    const outcomes = await Promise.all([
      context.operations.persistInvestigationFailure(command),
      context.operations.persistInvestigationFailure(command),
    ]);

    expect(outcomes.map(({ kind }) => kind).sort()).toEqual([
      "COMMITTED",
      "UNIQUE_CONFLICT",
    ]);
    expect(await getWorkflowDemoRecordCounts()).toEqual({
      investigations: 1,
      investigationEvidence: 0,
      humanReviewEscalations: 0,
      idempotencyRecords: 1,
      auditEvents: 2,
    });
  } finally {
    await context.disconnect();
    await resetWorkflowDemoData();
  }
});
