import { describe, expect, test } from "bun:test";
import type { OperationsWorkflowRepository } from "@repo/db";
import {
  EVIDENCE_SOURCE_NAMES,
  NormalizedOrderEvidenceSchema,
  type InvestigationDecision,
} from "@repo/schemas";

import {
  buildInvestigationAuditEvents,
  createInvestigationTraceReader,
} from "../index.js";

const AT = "2026-07-30T12:00:00.000Z";

describe("safe workflow observability", () => {
  test("builds ordered bounded investigation events and marks source failure", () => {
    let key = 0;
    const evidence = NormalizedOrderEvidenceSchema.parse({
      schemaVersion: 1,
      orderId: "ORD-OBS",
      collectedAt: AT,
      order: {
        id: "ORD-OBS",
        status: "CONFIRMED",
        createdAt: AT,
        updatedAt: AT,
      },
      orderItems: [],
      payment: null,
      fulfilment: null,
      fulfilmentEvents: [],
      shipment: null,
      inventoryObservations: [],
      warehouses: [],
      sourceReads: EVIDENCE_SOURCE_NAMES.map((source) => ({
        source,
        status: source === "PAYMENT" ? "FAILED" : "SUCCEEDED",
        readAt: AT,
        latestSourceTimestamp: source === "ORDER" ? AT : null,
        recordCount: source === "ORDER" ? 1 : 0,
        errorCode: source === "PAYMENT" ? "SOURCE_READ_FAILED" : null,
      })),
    });
    const decision = {
      schemaVersion: 1,
      orderId: "ORD-OBS",
      investigationStatus: "NEEDS_MORE_INFO",
      evidenceStatus: "MISSING",
      diagnosisCode: null,
      confidence: null,
      matchedRule: null,
      shouldEscalate: true,
      suggestedQueue: "OPERATIONS_DATA_REVIEW",
      suggestedNextStep:
        "Verify the missing commerce evidence identified in the investigation.",
      supportingFacts: [
        {
          code: "MISSING_EVIDENCE",
          path: "readiness.missingFields",
          value: ["sources.PAYMENT"],
        },
      ],
      eligibleAlternativeWarehouseIds: [],
      commerceStateChanged: false,
    } satisfies InvestigationDecision;

    const events = buildInvestigationAuditEvents({
      traceId: "TRACE-OBS",
      investigationId: "INV-OBS",
      createdAt: AT,
      keys: { nextAuditEventKey: () => `AUDIT-OBS-${++key}` },
      orderId: "ORD-OBS",
      clientRequestId: "REQ-OBS",
      evidence,
      decision,
    });

    expect(events[0]?.eventType).toBe("TOOL_CALL_STARTED");
    expect(events.at(-1)?.eventType).toBe("TOOL_CALL_SUCCEEDED");
    expect(
      events.find(({ eventType }) => eventType === "PAYMENT_FETCHED")?.status,
    ).toBe("FAILED");
    expect(
      events.some(({ eventType }) => eventType === "DIAGNOSIS_MATCHED"),
    ).toBeFalse();
    expect(JSON.stringify(events)).not.toContain("password");
  });

  test("returns null without dependent reads when an investigation is absent", async () => {
    let dependentReads = 0;
    const repository = {
      findInvestigationById: async () => null,
      findEvidenceByInvestigationId: async () => {
        dependentReads += 1;
        return null;
      },
      listAuditEventsForInvestigation: async () => {
        dependentReads += 1;
        return [];
      },
    } as unknown as OperationsWorkflowRepository;

    const result =
      await createInvestigationTraceReader(repository).getInvestigationTrace(
        "INV-MISSING",
      );
    expect(result).toBeNull();
    expect(dependentReads).toBe(0);
  });
});
