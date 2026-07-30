import { expect, test } from "bun:test";
import { createWorkflowRepositoryContext } from "@repo/db";
import { createEvidenceCollector } from "@repo/evidence";
import {
  approvedScenarioManifest,
  verifyApprovedDemoData,
} from "@repo/fixtures";
import {
  InvestigationDecisionSchema,
  type DiagnosisCode,
  type DiagnosisRuleId,
} from "@repo/schemas";

import {
  createDiagnosisEngine,
  createEvidenceReadinessEvaluator,
} from "../index.js";

const emptyWorkflowSummary = {
  investigations: 0,
  investigationEvidence: 0,
  humanReviewEscalations: 0,
  idempotencyRecords: 0,
  auditEvents: 0,
};

test("evaluates all approved scenarios through the restricted workflow repository", async () => {
  const before = await verifyApprovedDemoData();
  const context = createWorkflowRepositoryContext();
  const collector = createEvidenceCollector({
    commerce: context.commerce,
    clock: {
      now: () => new Date("2026-07-30T12:00:00.000Z"),
    },
  });
  const evaluator = createEvidenceReadinessEvaluator();
  const engine = createDiagnosisEngine();
  const ruleByDiagnosis: Record<DiagnosisCode, DiagnosisRuleId> = {
    ASSIGNED_WAREHOUSE_OUT_OF_STOCK: "assigned_warehouse_out_of_stock.v1",
    FULFILMENT_CREATION_FAILED: "fulfilment_creation_failed.v1",
    WITHIN_EXPECTED_PROCESSING_TIME: "within_expected_processing_time.v1",
    SHIPMENT_LABEL_CREATION_FAILED: "shipment_label_creation_failed.v1",
    SHIPMENT_ALREADY_EXISTS: "shipment_already_exists.v1",
    PAYMENT_NOT_CONFIRMED: "payment_not_confirmed.v1",
    CAUSE_NOT_DETERMINED: "cause_not_determined.v1",
  };

  try {
    const results = await Promise.all(
      approvedScenarioManifest.map(async (scenario) => {
        const evidence = await collector.collect(scenario.orderId);
        const readiness = evaluator.evaluate(evidence);
        return {
          scenario,
          actual: engine.decide({ evidence, readiness }),
        };
      }),
    );

    for (const { scenario, actual } of results) {
      expect(InvestigationDecisionSchema.parse(actual)).toEqual(actual);
      expect(actual.investigationStatus).toBe(
        scenario.expectedInvestigationStatus,
      );
      expect(actual.evidenceStatus).toBe(scenario.expectedEvidenceStatus);
      expect(actual.diagnosisCode).toBe(scenario.expectedDiagnosis);
      expect(actual.shouldEscalate).toBe(scenario.shouldEscalate);
      expect(actual.suggestedQueue).toBe(scenario.expectedQueue);
      expect(actual.suggestedNextStep).toBe(scenario.expectedSuggestedNextStep);
      expect(actual.commerceStateChanged).toBeFalse();

      if (scenario.expectedDiagnosis === null) {
        expect(actual.confidence).toBeNull();
        expect(actual.matchedRule).toBeNull();
      } else {
        expect(actual.confidence).toBe("CONFIRMED");
        expect(actual.matchedRule).toBe(
          ruleByDiagnosis[scenario.expectedDiagnosis],
        );
      }
    }

    const byOrderId = new Map(
      results.map(({ actual }) => [actual.orderId, actual]),
    );
    expect(byOrderId.get("ORD-1042")).toMatchObject({
      diagnosisCode: "ASSIGNED_WAREHOUSE_OUT_OF_STOCK",
      eligibleAlternativeWarehouseIds: ["WH-B"],
      commerceStateChanged: false,
    });
    expect(byOrderId.get("ORD-1044")?.supportingFacts).toContainEqual({
      code: "PROCESSING_WINDOW",
      path: "fulfilmentEvents.processingStarted",
      value: {
        eventId: "EVENT-1044-PROCESSING",
        processingStartedAt: "2026-07-30T10:30:00.000Z",
        decisionReferenceAt: "2026-07-30T12:00:00.000Z",
        elapsedMinutes: 90,
        windowMinutes: 240,
      },
    });
    expect(byOrderId.get("ORD-1046")).toMatchObject({
      investigationStatus: "NEEDS_MORE_INFO",
      evidenceStatus: "MISSING",
      diagnosisCode: null,
      confidence: null,
      matchedRule: null,
    });
    expect(byOrderId.get("ORD-1048")).toMatchObject({
      investigationStatus: "COMPLETED",
      evidenceStatus: "COMPLETE",
      diagnosisCode: "CAUSE_NOT_DETERMINED",
      matchedRule: "cause_not_determined.v1",
    });
    expect(byOrderId.get("ORD-1050")).toMatchObject({
      investigationStatus: "NEEDS_MORE_INFO",
      evidenceStatus: "CONFLICTING",
      diagnosisCode: null,
      confidence: null,
      matchedRule: null,
    });
  } finally {
    await context.disconnect();
  }

  const after = await verifyApprovedDemoData();
  expect(after.fixtures).toEqual(before.fixtures);
  expect(after.summary).toEqual(before.summary);
  expect(after.summary.workflow).toEqual(emptyWorkflowSummary);
}, 90_000);
