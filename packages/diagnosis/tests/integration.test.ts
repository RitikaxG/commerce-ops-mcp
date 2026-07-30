import { expect, test } from "bun:test";
import { createWorkflowRepositoryContext } from "@repo/db";
import { createEvidenceCollector } from "@repo/evidence";
import {
  approvedScenarioManifest,
  verifyApprovedDemoData,
} from "@repo/fixtures";
import { EvidenceReadinessResultSchema } from "@repo/schemas";

import { createEvidenceReadinessEvaluator } from "../index.js";

const emptyWorkflowSummary = {
  investigations: 0,
  investigationEvidence: 0,
  humanReviewEscalations: 0,
  idempotencyRecords: 0,
  auditEvents: 0,
};

test("evaluates all approved scenarios through the restricted workflow repository", async () => {
  const context = createWorkflowRepositoryContext();
  const collector = createEvidenceCollector({
    commerce: context.commerce,
    clock: {
      now: () => new Date("2026-07-30T13:00:00.000Z"),
    },
  });
  const evaluator = createEvidenceReadinessEvaluator();

  try {
    const results = await Promise.all(
      approvedScenarioManifest.map(async (scenario) => {
        const evidence = await collector.collect(scenario.orderId);
        return {
          expected: scenario.expectedEvidenceStatus,
          actual: evaluator.evaluate(evidence),
        };
      }),
    );

    for (const { expected, actual } of results) {
      expect(EvidenceReadinessResultSchema.parse(actual)).toEqual(actual);
      expect(actual.evidenceStatus).toBe(expected);
      expect(Object.keys(actual)).not.toContain("diagnosis");
      expect(Object.keys(actual)).not.toContain("suggestedNextStep");
    }

    const byOrderId = new Map(
      results.map(({ actual }) => [actual.orderId, actual]),
    );
    expect(byOrderId.get("ORD-1046")).toEqual({
      schemaVersion: 1,
      orderId: "ORD-1046",
      evidenceStatus: "MISSING",
      missingFields: ["inventory.assignedWarehouse.WH-A.SKU-1046"],
      conflicts: [],
    });
    expect(byOrderId.get("ORD-1050")).toEqual({
      schemaVersion: 1,
      orderId: "ORD-1050",
      evidenceStatus: "CONFLICTING",
      missingFields: [],
      conflicts: [
        {
          code: "INVENTORY_QUANTITY_MISMATCH",
          path: "inventory.WH-A.SKU-1050.availableQuantity",
          message:
            "Inventory sources report different available quantities for WH-A/SKU-1050.",
          observations: [
            {
              sourceSystem: "WAREHOUSE_SYSTEM",
              availableQuantity: 0,
              observedAt: "2026-07-30T12:00:00.000Z",
            },
            {
              sourceSystem: "COMMERCE_SYSTEM",
              availableQuantity: 4,
              observedAt: "2026-07-30T12:00:00.000Z",
            },
          ],
        },
      ],
    });
  } finally {
    await context.disconnect();
  }

  const { summary } = await verifyApprovedDemoData();
  expect(summary.workflow).toEqual(emptyWorkflowSummary);
}, 90_000);
