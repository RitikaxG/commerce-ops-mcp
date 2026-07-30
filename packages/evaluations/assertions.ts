import assert from "node:assert/strict";

import { McpToolFailureSchema } from "@repo/schemas";
import type { WorkflowDemoRecordCounts } from "@repo/db/testing";

export const ZERO_WORKFLOW_COUNTS: WorkflowDemoRecordCounts = {
  investigations: 0,
  investigationEvidence: 0,
  humanReviewEscalations: 0,
  idempotencyRecords: 0,
  auditEvents: 0,
};

export function assertNoSecretLeak(value: unknown): void {
  const serialized = JSON.stringify(value);
  for (const forbidden of [
    "postgresql://",
    "postgres://",
    "DATABASE_URL",
    "WORKFLOW_DATABASE_URL",
    "DEMO_DATABASE_URL",
    "PrismaClient",
    '"stack"',
  ]) {
    assert.equal(
      serialized.includes(forbidden),
      false,
      `Response leaked forbidden detail: ${forbidden}`,
    );
  }
}

export function assertWorkflowCounts(
  actual: WorkflowDemoRecordCounts,
  expected: Partial<WorkflowDemoRecordCounts>,
): void {
  for (const [name, value] of Object.entries(expected)) {
    assert.equal(
      actual[name as keyof WorkflowDemoRecordCounts],
      value,
      `Unexpected workflow count for ${name}`,
    );
  }
}

export async function expectSafeMcpRejection(
  operation: () => Promise<unknown>,
): Promise<void> {
  try {
    const raw = await operation();
    const result = raw as {
      isError?: boolean;
      structuredContent?: unknown;
    };
    assert.equal(result.isError, true);
    assertNoSecretLeak(result);
  } catch (error) {
    assertNoSecretLeak({
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function expectWorkflowMcpFailure(
  operation: () => Promise<unknown>,
  expectedCode: string,
): Promise<void> {
  const raw = await operation();
  const result = raw as {
    isError?: boolean;
    structuredContent?: unknown;
  };
  assert.equal(result.isError, true);
  const failure = McpToolFailureSchema.parse(result.structuredContent);
  assert.equal(failure.error.code, expectedCode);
  assert.equal(failure.commerceStateChanged, false);
  assertNoSecretLeak(result);
}
