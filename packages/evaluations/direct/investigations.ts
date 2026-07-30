import assert from "node:assert/strict";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { getWorkflowDemoRecordCounts } from "@repo/db/testing";
import { approvedScenarioManifest } from "@repo/fixtures";
import {
  InvestigateOrderExceptionToolSuccessSchema,
  type InvestigationWorkflowResult,
} from "@repo/schemas";

import { assertWorkflowCounts } from "../assertions.js";

export async function evaluateInvestigations(
  client: Client,
): Promise<Map<string, InvestigationWorkflowResult>> {
  const byOrderId = new Map<string, InvestigationWorkflowResult>();

  for (const scenario of approvedScenarioManifest) {
    const call = await client.callTool({
      name: "investigate_order_exception",
      arguments: {
        orderId: scenario.orderId,
        clientRequestId: `phase10-direct:${scenario.orderId}`,
        idempotencyKey: `phase10-direct:investigate:${scenario.orderId}`,
      },
    });
    assert.notEqual(call.isError, true);
    const result = InvestigateOrderExceptionToolSuccessSchema.parse(
      call.structuredContent,
    ).result;

    if (result.status === "FAILED") {
      assert.fail(`${scenario.orderId} unexpectedly returned FAILED`);
    }

    assert.equal(result.orderId, scenario.orderId);
    assert.equal(result.status, scenario.expectedInvestigationStatus);
    assert.equal(result.commerceStateChanged, false);
    assert.equal(
      result.decision.evidenceStatus,
      scenario.expectedEvidenceStatus,
    );
    assert.equal(result.decision.diagnosisCode, scenario.expectedDiagnosis);
    assert.equal(
      result.decision.shouldEscalate,
      scenario.shouldEscalate,
    );
    assert.equal(result.decision.suggestedQueue, scenario.expectedQueue);
    assert.equal(
      result.decision.suggestedNextStep,
      scenario.expectedSuggestedNextStep,
    );
    assert.equal(result.decision.commerceStateChanged, false);

    if (scenario.orderId === "ORD-1042") {
      assert.deepEqual(
        result.decision.eligibleAlternativeWarehouseIds,
        ["WH-B"],
      );
    }
    if (scenario.orderId === "ORD-1044") {
      assert.ok(
        result.decision.supportingFacts.some(({ code, value }) => {
          if (
            code !== "PROCESSING_WINDOW" ||
            typeof value !== "object" ||
            value === null ||
            Array.isArray(value)
          ) {
            return false;
          }
          return value.elapsedMinutes === 90 && value.windowMinutes === 240;
        }),
      );
    }
    if (scenario.orderId === "ORD-1046") {
      assert.equal(result.decision.diagnosisCode, null);
      assert.ok(
        result.decision.supportingFacts.some(
          ({ code, value }) =>
            code === "MISSING_EVIDENCE" &&
            Array.isArray(value) &&
            value.includes(
              "inventory.assignedWarehouse.WH-A.SKU-1046",
            ),
        ),
      );
    }
    if (scenario.orderId === "ORD-1048") {
      assert.equal(result.decision.diagnosisCode, "CAUSE_NOT_DETERMINED");
    }
    if (scenario.orderId === "ORD-1050") {
      assert.equal(result.decision.diagnosisCode, null);
      assert.ok(
        result.decision.supportingFacts.some(
          ({ code, value }) =>
            code === "CONFLICTING_EVIDENCE" &&
            Array.isArray(value) &&
            value.some(
              (conflict) =>
                typeof conflict === "object" &&
                conflict !== null &&
                "path" in conflict &&
                conflict.path ===
                  "inventory.WH-A.SKU-1050.availableQuantity",
            ),
        ),
      );
    }

    byOrderId.set(scenario.orderId, result);
  }

  assertWorkflowCounts(await getWorkflowDemoRecordCounts(), {
    investigations: 9,
    investigationEvidence: 9,
    humanReviewEscalations: 0,
    idempotencyRecords: 9,
  });

  const first = byOrderId.get("ORD-1042");
  assert.ok(first);
  const beforeRetry = await getWorkflowDemoRecordCounts();
  const retry = await client.callTool({
    name: "investigate_order_exception",
    arguments: {
      orderId: "ORD-1042",
      clientRequestId: "phase10-direct:ORD-1042",
      idempotencyKey: "phase10-direct:investigate:ORD-1042",
    },
  });
  assert.deepEqual(
    InvestigateOrderExceptionToolSuccessSchema.parse(
      retry.structuredContent,
    ).result,
    first,
  );
  assert.deepEqual(await getWorkflowDemoRecordCounts(), beforeRetry);

  return byOrderId;
}
