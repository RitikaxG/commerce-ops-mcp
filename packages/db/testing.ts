import { createOwnerDatabaseClient } from "./client.js";

export interface WorkflowDemoRecordCounts {
  investigations: number;
  investigationEvidence: number;
  humanReviewEscalations: number;
  idempotencyRecords: number;
  auditEvents: number;
}

function assertNonProduction(): void {
  if (process.env.NODE_ENV?.trim().toLowerCase() === "production") {
    throw new Error(
      "Workflow demo cleanup is disabled when NODE_ENV=production.",
    );
  }
}

export async function getWorkflowDemoRecordCounts(): Promise<WorkflowDemoRecordCounts> {
  assertNonProduction();
  const database = createOwnerDatabaseClient();
  try {
    const [
      investigations,
      investigationEvidence,
      humanReviewEscalations,
      idempotencyRecords,
      auditEvents,
    ] = await Promise.all([
      database.investigation.count(),
      database.investigationEvidence.count(),
      database.humanReviewEscalation.count(),
      database.idempotencyRecord.count(),
      database.auditEvent.count(),
    ]);
    return {
      investigations,
      investigationEvidence,
      humanReviewEscalations,
      idempotencyRecords,
      auditEvents,
    };
  } finally {
    await database.$disconnect();
  }
}

export async function resetWorkflowDemoData(): Promise<WorkflowDemoRecordCounts> {
  assertNonProduction();
  const database = createOwnerDatabaseClient();
  try {
    // This static owner-only cleanup is deliberately separate from every
    // runtime repository. TRUNCATE all related tables together preserves the
    // accepted foreign-key graph without weakening append-only triggers.
    await database.$executeRawUnsafe(`
      TRUNCATE TABLE
        "operations"."audit_events",
        "operations"."idempotency_records",
        "operations"."human_review_escalations",
        "operations"."investigation_evidence",
        "operations"."investigations"
      RESTART IDENTITY
    `);

    return {
      investigations: 0,
      investigationEvidence: 0,
      humanReviewEscalations: 0,
      idempotencyRecords: 0,
      auditEvents: 0,
    };
  } finally {
    await database.$disconnect();
  }
}
