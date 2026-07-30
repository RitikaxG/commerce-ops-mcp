import assert from "node:assert/strict";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { getWorkflowDemoRecordCounts } from "@repo/db/testing";
import { approvedScenarioManifest } from "@repo/fixtures";
import {
  CreateHumanReviewEscalationToolSuccessSchema,
  type HumanReviewEscalationResult,
  type InvestigationWorkflowResult,
} from "@repo/schemas";

import {
  assertWorkflowCounts,
  expectWorkflowMcpFailure,
} from "../assertions.js";
import { DIRECT_MCP_REASON_BY_ORDER_ID } from "../contracts.js";

export async function evaluateEscalations(
  client: Client,
  investigationByOrderId: ReadonlyMap<string, InvestigationWorkflowResult>,
): Promise<Map<string, HumanReviewEscalationResult>> {
  const byOrderId = new Map<string, HumanReviewEscalationResult>();

  for (const scenario of approvedScenarioManifest.filter(
    ({ shouldEscalate }) => shouldEscalate,
  )) {
    const investigation = investigationByOrderId.get(scenario.orderId);
    assert.ok(investigation);
    const call = await client.callTool({
      name: "create_human_review_escalation",
      arguments: {
        investigationId: investigation.investigationId,
        idempotencyKey: `phase10-direct:escalate:${scenario.orderId}`,
      },
    });
    assert.notEqual(call.isError, true);
    const result =
      CreateHumanReviewEscalationToolSuccessSchema.parse(
        call.structuredContent,
      ).result;
    assert.equal(result.disposition, "CREATED");
    assert.equal(result.investigationId, investigation.investigationId);
    assert.equal(result.orderId, scenario.orderId);
    assert.equal(result.queue, scenario.expectedQueue);
    assert.equal(
      result.reasonCode,
      DIRECT_MCP_REASON_BY_ORDER_ID[
        scenario.orderId as keyof typeof DIRECT_MCP_REASON_BY_ORDER_ID
      ],
    );
    assert.equal(
      result.suggestedNextStep,
      scenario.expectedSuggestedNextStep,
    );
    assert.equal(result.commerceStateChanged, false);
    byOrderId.set(scenario.orderId, result);
  }

  for (const orderId of ["ORD-1044", "ORD-1047"] as const) {
    const investigation = investigationByOrderId.get(orderId);
    assert.ok(investigation);
    await expectWorkflowMcpFailure(
      () =>
        client.callTool({
          name: "create_human_review_escalation",
          arguments: {
            investigationId: investigation.investigationId,
            idempotencyKey: `phase10-direct:escalate:${orderId}`,
          },
        }),
      "ESCALATION_NOT_ALLOWED",
    );
  }

  assertWorkflowCounts(await getWorkflowDemoRecordCounts(), {
    investigations: 9,
    investigationEvidence: 9,
    humanReviewEscalations: 7,
    idempotencyRecords: 16,
  });

  const first = byOrderId.get("ORD-1042");
  assert.ok(first);
  const beforeRetry = await getWorkflowDemoRecordCounts();
  const retry = await client.callTool({
    name: "create_human_review_escalation",
    arguments: {
      investigationId: first.investigationId,
      idempotencyKey: "phase10-direct:escalate:ORD-1042",
    },
  });
  assert.deepEqual(
    CreateHumanReviewEscalationToolSuccessSchema.parse(
      retry.structuredContent,
    ).result,
    first,
  );
  assert.deepEqual(await getWorkflowDemoRecordCounts(), beforeRetry);

  const beforeReuse = await getWorkflowDemoRecordCounts();
  const reuseCall = await client.callTool({
    name: "create_human_review_escalation",
    arguments: {
      investigationId: first.investigationId,
      idempotencyKey: "phase10-direct:escalate:ORD-1042:second-key",
    },
  });
  const reuse =
    CreateHumanReviewEscalationToolSuccessSchema.parse(
      reuseCall.structuredContent,
    ).result;
  assert.equal(reuse.disposition, "REUSED");
  assert.equal(reuse.reviewCaseId, first.reviewCaseId);

  const afterReuse = await getWorkflowDemoRecordCounts();
  assert.equal(afterReuse.humanReviewEscalations, 7);
  assert.equal(afterReuse.idempotencyRecords, 17);
  assert.equal(afterReuse.auditEvents, beforeReuse.auditEvents + 3);

  return byOrderId;
}
