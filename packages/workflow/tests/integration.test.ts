import { describe, expect, test } from "bun:test";
import {
  getWorkflowDemoRecordCounts,
  resetWorkflowDemoData,
} from "@repo/db/testing";
import {
  approvedScenarioManifest,
  verifyApprovedDemoData,
} from "@repo/fixtures";

import {
  WorkflowError,
  createCommerceOperationsWorkflowContext,
} from "../index.js";

const emptyCounts = {
  investigations: 0,
  investigationEvidence: 0,
  humanReviewEscalations: 0,
  idempotencyRecords: 0,
  auditEvents: 0,
};

async function expectedWorkflowError(
  operation: Promise<unknown>,
  code: WorkflowError["code"],
): Promise<void> {
  try {
    await operation;
  } catch (error) {
    expect(error).toBeInstanceOf(WorkflowError);
    expect((error as WorkflowError).code).toBe(code);
    return;
  }
  throw new Error(`Expected workflow error ${code}`);
}

describe.serial("live persistent workflow", () => {
  test("persists and queries all nine approved scenarios without commerce mutation", async () => {
    const before = await verifyApprovedDemoData();
    await resetWorkflowDemoData();
    const context = await createCommerceOperationsWorkflowContext();
    try {
      const investigations = [];
      for (const scenario of approvedScenarioManifest) {
        const result = await context.workflow.investigateOrderException({
          orderId: scenario.orderId,
          clientRequestId: `REQ-PHASE9-${scenario.orderId}`,
          idempotencyKey: `IDEM-PHASE9-${scenario.orderId}`,
        });
        investigations.push({ scenario, result });
      }

      expect(await getWorkflowDemoRecordCounts()).toMatchObject({
        investigations: 9,
        investigationEvidence: 9,
        humanReviewEscalations: 0,
        idempotencyRecords: 9,
      });
      for (const { scenario, result } of investigations) {
        expect(result.status).toBe(scenario.expectedInvestigationStatus);
        if (result.status !== "FAILED") {
          expect(result.decision.evidenceStatus).toBe(
            scenario.expectedEvidenceStatus,
          );
          expect(result.decision.diagnosisCode).toBe(
            scenario.expectedDiagnosis,
          );
          expect(result.decision.suggestedQueue).toBe(scenario.expectedQueue);
          expect(result.decision.suggestedNextStep).toBe(
            scenario.expectedSuggestedNextStep,
          );
        }
        expect(result.commerceStateChanged).toBeFalse();
      }

      const byOrderId = new Map(
        investigations.map(({ result }) => [result.orderId, result]),
      );
      const missing = byOrderId.get("ORD-1046");
      const conflicting = byOrderId.get("ORD-1050");
      if (missing?.status === "FAILED" || conflicting?.status === "FAILED") {
        throw new Error("Approved uncertainty scenarios must not fail");
      }
      expect(missing?.decision).toMatchObject({
        investigationStatus: "NEEDS_MORE_INFO",
        evidenceStatus: "MISSING",
        diagnosisCode: null,
        suggestedNextStep:
          "Verify the missing assigned-warehouse inventory evidence.",
      });
      expect(conflicting?.decision).toMatchObject({
        investigationStatus: "NEEDS_MORE_INFO",
        evidenceStatus: "CONFLICTING",
        diagnosisCode: null,
      });
      const missingTrace = await context.workflow.getInvestigationTrace({
        investigationId: missing!.investigationId,
      });
      expect(missingTrace.evidence?.missingFields).toEqual([
        "inventory.assignedWarehouse.WH-A.SKU-1046",
      ]);
      const conflictTrace = await context.workflow.getInvestigationTrace({
        investigationId: conflicting!.investigationId,
      });
      expect(conflictTrace.evidence?.conflicts).toHaveLength(1);

      const escalations = [];
      for (const { scenario, result } of investigations) {
        const request = context.workflow.createHumanReviewEscalation({
          investigationId: result.investigationId,
          idempotencyKey: `CASE-IDEM-${scenario.orderId}`,
        });
        if (scenario.shouldEscalate) {
          escalations.push({
            scenario,
            result: await request,
            investigation: result,
          });
        } else {
          await expectedWorkflowError(request, "ESCALATION_NOT_ALLOWED");
        }
      }

      expect(escalations.map(({ scenario }) => scenario.orderId)).toEqual([
        "ORD-1042",
        "ORD-1043",
        "ORD-1045",
        "ORD-1046",
        "ORD-1048",
        "ORD-1049",
        "ORD-1050",
      ]);
      expect(await getWorkflowDemoRecordCounts()).toMatchObject({
        investigations: 9,
        investigationEvidence: 9,
        humanReviewEscalations: 7,
        idempotencyRecords: 16,
      });
      for (const { scenario, result } of escalations) {
        if (scenario.expectedQueue === null) {
          throw new Error("Escalated scenarios require an approved queue");
        }
        expect(result.disposition).toBe("CREATED");
        expect(result.queue).toBe(scenario.expectedQueue);
        expect(result.commerceStateChanged).toBeFalse();
      }

      const first = escalations[0]!;
      const beforeReplay = await getWorkflowDemoRecordCounts();
      const exactReplay = await context.workflow.createHumanReviewEscalation({
        investigationId: first.investigation.investigationId,
        idempotencyKey: `CASE-IDEM-${first.scenario.orderId}`,
      });
      expect(exactReplay).toEqual(first.result);
      expect(await getWorkflowDemoRecordCounts()).toEqual(beforeReplay);

      const reused = await context.workflow.createHumanReviewEscalation({
        investigationId: first.investigation.investigationId,
        idempotencyKey: "CASE-IDEM-ORD-1042-SECOND",
      });
      expect(reused).toMatchObject({
        disposition: "REUSED",
        reviewCaseId: first.result.reviewCaseId,
      });
      const afterReuse = await getWorkflowDemoRecordCounts();
      expect(afterReuse.humanReviewEscalations).toBe(7);
      expect(afterReuse.idempotencyRecords).toBe(17);
      expect(afterReuse.auditEvents - beforeReplay.auditEvents).toBe(3);

      const caseResult = await context.workflow.getReviewCase({
        reviewCaseId: first.result.reviewCaseId,
      });
      expect(caseResult.reviewCase.reviewCaseId).toBe(
        first.result.reviewCaseId,
      );
      expect(caseResult.investigation.investigationId).toBe(
        first.investigation.investigationId,
      );
      const trace = await context.workflow.getInvestigationTrace({
        investigationId: first.investigation.investigationId,
      });
      expect(trace.auditEvents).toContainEqual(
        expect.objectContaining({
          eventType: "HUMAN_REVIEW_CASE_REUSED",
          reviewCaseId: first.result.reviewCaseId,
        }),
      );
      const numericIds = trace.auditEvents.map(({ id }) => BigInt(id));
      expect(numericIds).toEqual(
        [...numericIds].sort((a, b) => (a < b ? -1 : 1)),
      );

      const after = await verifyApprovedDemoData();
      expect(after.fixtures).toEqual(before.fixtures);
      expect(after.summary.commerce).toEqual(before.summary.commerce);
    } finally {
      await context.disconnect();
      await resetWorkflowDemoData();
    }
    expect(await getWorkflowDemoRecordCounts()).toEqual(emptyCounts);
  }, 120_000);

  test("concurrent retries create exactly one logical effect", async () => {
    await resetWorkflowDemoData();
    const context = await createCommerceOperationsWorkflowContext();
    try {
      const sameInput = {
        orderId: "ORD-1042",
        clientRequestId: "REQ-CONCURRENT-SAME",
        idempotencyKey: "IDEM-CONCURRENT-SAME",
      };
      const sameResults = await Promise.all(
        Array.from({ length: 6 }, () =>
          context.workflow.investigateOrderException(sameInput),
        ),
      );
      expect(
        sameResults.every(
          (result) =>
            result.investigationId === sameResults[0]?.investigationId,
        ),
      ).toBeTrue();
      expect(await getWorkflowDemoRecordCounts()).toMatchObject({
        investigations: 1,
        investigationEvidence: 1,
        idempotencyRecords: 1,
      });

      await resetWorkflowDemoData();
      const differentInputRace = await Promise.allSettled([
        context.workflow.investigateOrderException({
          orderId: "ORD-1042",
          clientRequestId: "REQ-DIFFERENT-A",
          idempotencyKey: "IDEM-DIFFERENT-RACE",
        }),
        context.workflow.investigateOrderException({
          orderId: "ORD-1043",
          clientRequestId: "REQ-DIFFERENT-B",
          idempotencyKey: "IDEM-DIFFERENT-RACE",
        }),
      ]);
      expect(
        differentInputRace.filter(({ status }) => status === "fulfilled"),
      ).toHaveLength(1);
      const rejected = differentInputRace.find(
        ({ status }) => status === "rejected",
      );
      expect(rejected?.status).toBe("rejected");
      if (rejected?.status === "rejected") {
        expect(rejected.reason).toBeInstanceOf(WorkflowError);
        expect((rejected.reason as WorkflowError).code).toBe(
          "IDEMPOTENCY_KEY_REUSE",
        );
      }
      expect((await getWorkflowDemoRecordCounts()).investigations).toBe(1);

      await resetWorkflowDemoData();
      const clientRequestResults = await Promise.all([
        context.workflow.investigateOrderException({
          orderId: "ORD-1042",
          clientRequestId: "REQ-CLIENT-RACE",
          idempotencyKey: "IDEM-CLIENT-RACE-A",
        }),
        context.workflow.investigateOrderException({
          orderId: "ORD-1042",
          clientRequestId: "REQ-CLIENT-RACE",
          idempotencyKey: "IDEM-CLIENT-RACE-B",
        }),
      ]);
      expect(clientRequestResults[0]).toEqual(clientRequestResults[1]);
      expect(await getWorkflowDemoRecordCounts()).toMatchObject({
        investigations: 1,
        investigationEvidence: 1,
        idempotencyRecords: 2,
      });

      const investigation = clientRequestResults[0]!;
      const caseInput = {
        investigationId: investigation.investigationId,
        idempotencyKey: "CASE-CONCURRENT-SAME",
      };
      const caseResults = await Promise.all(
        Array.from({ length: 6 }, () =>
          context.workflow.createHumanReviewEscalation(caseInput),
        ),
      );
      expect(
        caseResults.every(
          (result) => result.reviewCaseId === caseResults[0]?.reviewCaseId,
        ),
      ).toBeTrue();
      expect(await getWorkflowDemoRecordCounts()).toMatchObject({
        humanReviewEscalations: 1,
        idempotencyRecords: 3,
      });

      const reused = await context.workflow.createHumanReviewEscalation({
        investigationId: investigation.investigationId,
        idempotencyKey: "CASE-CONCURRENT-DIFFERENT",
      });
      expect(reused.disposition).toBe("REUSED");
      expect((await getWorkflowDemoRecordCounts()).humanReviewEscalations).toBe(
        1,
      );
    } finally {
      await context.disconnect();
      await resetWorkflowDemoData();
    }
    expect(await getWorkflowDemoRecordCounts()).toEqual(emptyCounts);
  }, 120_000);
});
