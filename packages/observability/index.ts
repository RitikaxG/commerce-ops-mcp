import type { AuditEventDraft, OperationsWorkflowRepository } from "@repo/db";
import {
  InvestigationTraceSchema,
  type InvestigationDecision,
  type InvestigationTrace,
  type NormalizedOrderEvidence,
} from "@repo/schemas";

export interface AuditEventKeyFactory {
  nextAuditEventKey(): string;
}

interface AuditBase {
  traceId: string;
  investigationId: string;
  reviewCaseId?: string | null;
  createdAt: string;
  keys: AuditEventKeyFactory;
}

function event(
  base: AuditBase,
  input: Omit<
    AuditEventDraft,
    "eventKey" | "traceId" | "investigationId" | "reviewCaseId" | "createdAt"
  >,
): AuditEventDraft {
  return {
    eventKey: base.keys.nextAuditEventKey(),
    traceId: base.traceId,
    investigationId: base.investigationId,
    reviewCaseId: base.reviewCaseId ?? null,
    createdAt: base.createdAt,
    ...input,
  };
}

function sourceSummary(
  evidence: NormalizedOrderEvidence,
  sourceNames: readonly string[],
) {
  return evidence.sourceReads
    .filter(({ source }) => sourceNames.includes(source))
    .map(({ source, status, recordCount, errorCode }) => ({
      source,
      status,
      recordCount,
      errorCode,
    }));
}

function sourceEventStatus(
  evidence: NormalizedOrderEvidence,
  sourceNames: readonly string[],
): "SUCCEEDED" | "FAILED" {
  return evidence.sourceReads.some(
    ({ source, status }) =>
      sourceNames.includes(source) && status !== "SUCCEEDED",
  )
    ? "FAILED"
    : "SUCCEEDED";
}

function supportingFactArrayLength(
  decision: InvestigationDecision,
  code: "MISSING_EVIDENCE" | "CONFLICTING_EVIDENCE",
): number {
  const value = decision.supportingFacts.find(
    (fact) => fact.code === code,
  )?.value;
  return Array.isArray(value) ? value.length : 0;
}

export function buildInvestigationAuditEvents(
  input: AuditBase & {
    orderId: string;
    clientRequestId: string;
    evidence: NormalizedOrderEvidence;
    decision: InvestigationDecision;
  },
): AuditEventDraft[] {
  const baseSummary = {
    orderId: input.orderId,
    clientRequestId: input.clientRequestId,
    commerceStateChanged: false,
  };
  const sourceEvents = [
    {
      eventType: "ORDER_FETCHED" as const,
      sources: ["ORDER", "ORDER_ITEMS"],
    },
    { eventType: "PAYMENT_FETCHED" as const, sources: ["PAYMENT"] },
    { eventType: "FULFILMENT_FETCHED" as const, sources: ["FULFILMENT"] },
    {
      eventType: "INVENTORY_FETCHED" as const,
      sources: ["INVENTORY", "WAREHOUSES"],
    },
    { eventType: "SHIPMENT_CHECKED" as const, sources: ["SHIPMENT"] },
    { eventType: "EVENTS_FETCHED" as const, sources: ["FULFILMENT_EVENTS"] },
  ].map(({ eventType, sources }) =>
    event(input, {
      eventType,
      toolName: "investigate_order_exception",
      status: sourceEventStatus(input.evidence, sources),
      safeInputSummary: { orderId: input.orderId },
      safeOutputSummary: { sources: sourceSummary(input.evidence, sources) },
      errorCode: null,
      durationMs: null,
    }),
  );

  return [
    event(input, {
      eventType: "TOOL_CALL_STARTED",
      toolName: "investigate_order_exception",
      status: "STARTED",
      safeInputSummary: baseSummary,
      safeOutputSummary: null,
      errorCode: null,
      durationMs: null,
    }),
    event(input, {
      eventType: "INVESTIGATION_STARTED",
      toolName: "investigate_order_exception",
      status: "STARTED",
      safeInputSummary: {
        orderId: input.orderId,
        clientRequestId: input.clientRequestId,
      },
      safeOutputSummary: null,
      errorCode: null,
      durationMs: null,
    }),
    ...sourceEvents,
    event(input, {
      eventType: "EVIDENCE_VALIDATED",
      toolName: "investigate_order_exception",
      status: "SUCCEEDED",
      safeInputSummary: null,
      safeOutputSummary: {
        evidenceStatus: input.decision.evidenceStatus,
        missingFieldCount:
          input.decision.evidenceStatus === "MISSING"
            ? supportingFactArrayLength(input.decision, "MISSING_EVIDENCE")
            : 0,
        conflictCount:
          input.decision.evidenceStatus === "CONFLICTING"
            ? supportingFactArrayLength(input.decision, "CONFLICTING_EVIDENCE")
            : 0,
      },
      errorCode: null,
      durationMs: null,
    }),
    ...(input.decision.investigationStatus === "COMPLETED"
      ? [
          event(input, {
            eventType: "DIAGNOSIS_MATCHED",
            toolName: "investigate_order_exception",
            status: "SUCCEEDED",
            safeInputSummary: null,
            safeOutputSummary: {
              diagnosisCode: input.decision.diagnosisCode,
              matchedRule: input.decision.matchedRule,
              queue: input.decision.suggestedQueue,
            },
            errorCode: null,
            durationMs: null,
          }),
        ]
      : []),
    event(input, {
      eventType: "INVESTIGATION_PERSISTED",
      toolName: "investigate_order_exception",
      status: "SUCCEEDED",
      safeInputSummary: { investigationId: input.investigationId },
      safeOutputSummary: {
        investigationStatus: input.decision.investigationStatus,
        evidenceStatus: input.decision.evidenceStatus,
      },
      errorCode: null,
      durationMs: null,
    }),
    event(input, {
      eventType: "TOOL_CALL_SUCCEEDED",
      toolName: "investigate_order_exception",
      status: "SUCCEEDED",
      safeInputSummary: null,
      safeOutputSummary: {
        investigationId: input.investigationId,
        status: input.decision.investigationStatus,
        commerceStateChanged: false,
      },
      errorCode: null,
      durationMs: null,
    }),
  ];
}

export function buildFailedInvestigationAuditEvents(
  input: AuditBase & {
    orderId: string;
    clientRequestId: string;
    errorCode: "WORKFLOW_EXECUTION_FAILED";
  },
): AuditEventDraft[] {
  return [
    event(input, {
      eventType: "TOOL_CALL_STARTED",
      toolName: "investigate_order_exception",
      status: "STARTED",
      safeInputSummary: {
        orderId: input.orderId,
        clientRequestId: input.clientRequestId,
        commerceStateChanged: false,
      },
      safeOutputSummary: null,
      errorCode: null,
      durationMs: null,
    }),
    event(input, {
      eventType: "INVESTIGATION_STARTED",
      toolName: "investigate_order_exception",
      status: "STARTED",
      safeInputSummary: { orderId: input.orderId },
      safeOutputSummary: null,
      errorCode: null,
      durationMs: null,
    }),
    event(input, {
      eventType: "INVESTIGATION_FAILED",
      toolName: "investigate_order_exception",
      status: "FAILED",
      safeInputSummary: { investigationId: input.investigationId },
      safeOutputSummary: { commerceStateChanged: false },
      errorCode: input.errorCode,
      durationMs: null,
    }),
    event(input, {
      eventType: "TOOL_CALL_FAILED",
      toolName: "investigate_order_exception",
      status: "FAILED",
      safeInputSummary: null,
      safeOutputSummary: {
        investigationId: input.investigationId,
        commerceStateChanged: false,
      },
      errorCode: input.errorCode,
      durationMs: null,
    }),
  ];
}

export function buildReviewCaseAuditEvents(
  input: AuditBase & {
    disposition: "CREATED" | "REUSED";
    orderId: string;
    queue: string;
    reasonCode: string;
  },
): AuditEventDraft[] {
  const caseEvent =
    input.disposition === "CREATED"
      ? "HUMAN_REVIEW_CASE_CREATED"
      : "HUMAN_REVIEW_CASE_REUSED";
  return [
    event(input, {
      eventType: "TOOL_CALL_STARTED",
      toolName: "create_human_review_escalation",
      status: "STARTED",
      safeInputSummary: { investigationId: input.investigationId },
      safeOutputSummary: null,
      errorCode: null,
      durationMs: null,
    }),
    event(input, {
      eventType: caseEvent,
      toolName: "create_human_review_escalation",
      status: "SUCCEEDED",
      safeInputSummary: {
        investigationId: input.investigationId,
        orderId: input.orderId,
      },
      safeOutputSummary: {
        reviewCaseId: input.reviewCaseId ?? null,
        disposition: input.disposition,
        queue: input.queue,
        reasonCode: input.reasonCode,
        commerceStateChanged: false,
      },
      errorCode: null,
      durationMs: null,
    }),
    event(input, {
      eventType: "TOOL_CALL_SUCCEEDED",
      toolName: "create_human_review_escalation",
      status: "SUCCEEDED",
      safeInputSummary: null,
      safeOutputSummary: {
        reviewCaseId: input.reviewCaseId ?? null,
        disposition: input.disposition,
        commerceStateChanged: false,
      },
      errorCode: null,
      durationMs: null,
    }),
  ];
}

export interface InvestigationTraceReader {
  getInvestigationTrace(
    investigationId: string,
  ): Promise<InvestigationTrace | null>;
}

export function createInvestigationTraceReader(
  operations: OperationsWorkflowRepository,
): InvestigationTraceReader {
  return {
    async getInvestigationTrace(investigationId) {
      const investigation =
        await operations.findInvestigationById(investigationId);
      if (!investigation) {
        return null;
      }
      const [evidence, auditEvents] = await Promise.all([
        operations.findEvidenceByInvestigationId(investigationId),
        operations.listAuditEventsForInvestigation(investigationId),
      ]);
      return InvestigationTraceSchema.parse({
        schemaVersion: 1,
        investigation,
        evidence,
        auditEvents,
        commerceStateChanged: false,
      });
    },
  };
}
