import assert from "node:assert/strict";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { getWorkflowDemoRecordCounts } from "@repo/db/testing";
import {
  GetInvestigationTraceToolSuccessSchema,
  GetReviewCaseToolSuccessSchema,
  type HumanReviewEscalationResult,
  type InvestigationWorkflowResult,
} from "@repo/schemas";

export async function evaluateReads(
  client: Client,
  investigationByOrderId: ReadonlyMap<string, InvestigationWorkflowResult>,
  escalationByOrderId: ReadonlyMap<string, HumanReviewEscalationResult>,
): Promise<void> {
  const investigation = investigationByOrderId.get("ORD-1042");
  const reviewCase = escalationByOrderId.get("ORD-1042");
  assert.ok(investigation);
  assert.ok(reviewCase);

  const before = await getWorkflowDemoRecordCounts();

  const caseCall = await client.callTool({
    name: "get_review_case",
    arguments: { reviewCaseId: reviewCase.reviewCaseId },
  });
  const caseResult = GetReviewCaseToolSuccessSchema.parse(
    caseCall.structuredContent,
  ).result;
  assert.equal(caseResult.reviewCase.reviewCaseId, reviewCase.reviewCaseId);
  assert.equal(
    caseResult.investigation.investigationId,
    investigation.investigationId,
  );

  const traceCall = await client.callTool({
    name: "get_investigation_trace",
    arguments: { investigationId: investigation.investigationId },
  });
  const trace = GetInvestigationTraceToolSuccessSchema.parse(
    traceCall.structuredContent,
  ).result;
  assert.equal(
    trace.investigation.investigationId,
    investigation.investigationId,
  );
  assert.equal(trace.evidence?.snapshot.orderId, "ORD-1042");
  assert.deepEqual(
    trace.auditEvents
      .filter(
        ({ toolName }) => toolName === "create_human_review_escalation",
      )
      .map(({ eventType }) => eventType),
    [
      "TOOL_CALL_STARTED",
      "HUMAN_REVIEW_CASE_CREATED",
      "TOOL_CALL_SUCCEEDED",
      "TOOL_CALL_STARTED",
      "HUMAN_REVIEW_CASE_REUSED",
      "TOOL_CALL_SUCCEEDED",
    ],
  );

  assert.deepEqual(await getWorkflowDemoRecordCounts(), before);
}
