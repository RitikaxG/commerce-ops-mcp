import { z } from "zod";

import {
  DiagnosisCodeSchema,
  EvidenceStatusSchema,
  ReviewQueueSchema,
} from "./approved-scenario.js";
import { JsonValueSchema } from "./commerce-records.js";
import {
  EvidenceConflictSchema,
  EvidenceMissingFieldPathSchema,
} from "./evidence-readiness.js";
import { InvestigationDecisionSchema } from "./investigation-decision.js";
import {
  EVIDENCE_SOURCE_NAMES,
  EvidenceSourceReadErrorCodeSchema,
  EvidenceSourceReadStatusSchema,
  NormalizedOrderEvidenceSchema,
} from "./normalized-evidence.js";

export const WorkflowIdentifierSchema = z.string().trim().min(1).max(200);
const TimestampSchema = z.string().datetime({ offset: true });

export const InvestigateOrderExceptionInputSchema = z
  .object({
    orderId: WorkflowIdentifierSchema,
    clientRequestId: WorkflowIdentifierSchema,
    idempotencyKey: WorkflowIdentifierSchema,
  })
  .strict();

export const InvestigationWorkflowSuccessSchema = z
  .object({
    schemaVersion: z.literal(1),
    investigationId: WorkflowIdentifierSchema,
    traceId: WorkflowIdentifierSchema,
    clientRequestId: WorkflowIdentifierSchema,
    orderId: WorkflowIdentifierSchema,
    status: z.enum(["COMPLETED", "NEEDS_MORE_INFO"]),
    decision: InvestigationDecisionSchema,
    evidenceSnapshotSchemaVersion: z.literal(1),
    createdAt: TimestampSchema,
    completedAt: TimestampSchema,
    commerceStateChanged: z.literal(false),
  })
  .strict()
  .superRefine((result, context) => {
    if (
      result.decision.orderId !== result.orderId ||
      result.decision.investigationStatus !== result.status
    ) {
      context.addIssue({
        code: "custom",
        message: "The persisted result and decision must identify one outcome",
        path: ["decision"],
      });
    }
  });

export const InvestigationWorkflowFailureSchema = z
  .object({
    schemaVersion: z.literal(1),
    investigationId: WorkflowIdentifierSchema,
    traceId: WorkflowIdentifierSchema,
    clientRequestId: WorkflowIdentifierSchema,
    orderId: WorkflowIdentifierSchema,
    status: z.literal("FAILED"),
    errorCode: z.literal("WORKFLOW_EXECUTION_FAILED"),
    createdAt: TimestampSchema,
    completedAt: TimestampSchema,
    commerceStateChanged: z.literal(false),
  })
  .strict();

export const InvestigationWorkflowResultSchema = z.discriminatedUnion(
  "status",
  [InvestigationWorkflowSuccessSchema, InvestigationWorkflowFailureSchema],
);

export const CreateHumanReviewEscalationInputSchema = z
  .object({
    investigationId: WorkflowIdentifierSchema,
    idempotencyKey: WorkflowIdentifierSchema,
  })
  .strict();

export const ReviewReasonCodeSchema = z.enum([
  "ASSIGNED_WAREHOUSE_OUT_OF_STOCK",
  "FULFILMENT_CREATION_FAILED",
  "SHIPMENT_LABEL_CREATION_FAILED",
  "SHIPMENT_ALREADY_EXISTS",
  "PAYMENT_NOT_CONFIRMED",
  "CAUSE_NOT_DETERMINED",
  "MISSING_EVIDENCE",
  "CONFLICTING_EVIDENCE",
]);

export const HumanReviewEscalationResultSchema = z
  .object({
    schemaVersion: z.literal(1),
    disposition: z.enum(["CREATED", "REUSED"]),
    reviewCaseId: WorkflowIdentifierSchema,
    investigationId: WorkflowIdentifierSchema,
    orderId: WorkflowIdentifierSchema,
    status: z.literal("AWAITING_REVIEW"),
    queue: ReviewQueueSchema,
    reasonCode: ReviewReasonCodeSchema,
    suggestedNextStep: z.string().trim().min(1).max(2_000),
    dedupeKey: z.string().trim().min(1).max(400),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
    commerceStateChanged: z.literal(false),
  })
  .strict()
  .superRefine((result, context) => {
    if (result.dedupeKey !== `human-review:${result.investigationId}`) {
      context.addIssue({
        code: "custom",
        message: "The review-case dedupe key must identify its investigation",
        path: ["dedupeKey"],
      });
    }
  });

export const PersistedInvestigationSummarySchema = z
  .object({
    schemaVersion: z.literal(1),
    investigationId: WorkflowIdentifierSchema,
    traceId: WorkflowIdentifierSchema,
    orderId: WorkflowIdentifierSchema,
    clientRequestId: WorkflowIdentifierSchema,
    status: z.enum(["RUNNING", "COMPLETED", "NEEDS_MORE_INFO", "FAILED"]),
    evidenceStatus: EvidenceStatusSchema.nullable(),
    diagnosisCode: DiagnosisCodeSchema.nullable(),
    confidence: z.literal("CONFIRMED").nullable(),
    matchedRule: z.string().trim().min(1).nullable(),
    suggestedQueue: ReviewQueueSchema.nullable(),
    suggestedNextStep: z.string().trim().min(1).nullable(),
    errorCode: z.string().trim().min(1).nullable(),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
    completedAt: TimestampSchema.nullable(),
    commerceStateChanged: z.literal(false),
  })
  .strict()
  .superRefine((investigation, context) => {
    const terminal = investigation.completedAt !== null;
    const hasDiagnosis =
      investigation.diagnosisCode !== null &&
      investigation.confidence === "CONFIRMED" &&
      investigation.matchedRule !== null;
    const hasNoDiagnosis =
      investigation.diagnosisCode === null &&
      investigation.confidence === null &&
      investigation.matchedRule === null;
    const valid =
      (investigation.status === "RUNNING" &&
        !terminal &&
        investigation.evidenceStatus === null &&
        hasNoDiagnosis &&
        investigation.errorCode === null) ||
      (investigation.status === "FAILED" &&
        terminal &&
        investigation.evidenceStatus === null &&
        hasNoDiagnosis &&
        investigation.suggestedQueue === null &&
        investigation.suggestedNextStep === null &&
        investigation.errorCode !== null) ||
      (investigation.status === "COMPLETED" &&
        terminal &&
        investigation.evidenceStatus === "COMPLETE" &&
        hasDiagnosis &&
        investigation.errorCode === null) ||
      (investigation.status === "NEEDS_MORE_INFO" &&
        terminal &&
        (investigation.evidenceStatus === "MISSING" ||
          investigation.evidenceStatus === "CONFLICTING") &&
        hasNoDiagnosis &&
        investigation.errorCode === null);
    if (!valid) {
      context.addIssue({
        code: "custom",
        message: "Persisted investigation lifecycle fields are inconsistent",
        path: ["status"],
      });
    }
  });

const PersistedEvidenceSourceObservationSchema = z
  .object({
    status: EvidenceSourceReadStatusSchema,
    readAt: TimestampSchema,
    latestSourceTimestamp: TimestampSchema.nullable(),
    recordCount: z.number().int().nonnegative(),
    errorCode: EvidenceSourceReadErrorCodeSchema.nullable(),
  })
  .strict();

export const PersistedEvidenceSourceObservationsSchema = z
  .object(
    Object.fromEntries(
      EVIDENCE_SOURCE_NAMES.map((source) => [
        source,
        PersistedEvidenceSourceObservationSchema,
      ]),
    ) as Record<
      (typeof EVIDENCE_SOURCE_NAMES)[number],
      typeof PersistedEvidenceSourceObservationSchema
    >,
  )
  .strict();

export const PersistedInvestigationEvidenceSchema = z
  .object({
    schemaVersion: z.literal(1),
    investigationId: WorkflowIdentifierSchema,
    snapshotSchemaVersion: z.literal(1),
    snapshot: NormalizedOrderEvidenceSchema,
    missingFields: z.array(EvidenceMissingFieldPathSchema),
    conflicts: z.array(EvidenceConflictSchema),
    sourceObservedAt: PersistedEvidenceSourceObservationsSchema,
    createdAt: TimestampSchema,
  })
  .strict();

export const AuditEventTypeSchema = z.enum([
  "INVESTIGATION_STARTED",
  "INVESTIGATION_FAILED",
  "TOOL_CALL_STARTED",
  "ORDER_FETCHED",
  "PAYMENT_FETCHED",
  "FULFILMENT_FETCHED",
  "INVENTORY_FETCHED",
  "SHIPMENT_CHECKED",
  "EVENTS_FETCHED",
  "EVIDENCE_VALIDATED",
  "DIAGNOSIS_MATCHED",
  "INVESTIGATION_PERSISTED",
  "TOOL_CALL_SUCCEEDED",
  "TOOL_CALL_FAILED",
  "HUMAN_REVIEW_CASE_CREATED",
  "HUMAN_REVIEW_CASE_REUSED",
]);

export const SafeAuditEventSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().regex(/^(0|[1-9]\d*)$/),
    eventKey: WorkflowIdentifierSchema,
    traceId: WorkflowIdentifierSchema,
    investigationId: WorkflowIdentifierSchema.nullable(),
    reviewCaseId: WorkflowIdentifierSchema.nullable(),
    eventType: AuditEventTypeSchema,
    toolName: WorkflowIdentifierSchema.nullable(),
    status: z.enum(["STARTED", "SUCCEEDED", "FAILED"]),
    safeInputSummary: JsonValueSchema.nullable(),
    safeOutputSummary: JsonValueSchema.nullable(),
    errorCode: z.string().trim().min(1).nullable(),
    durationMs: z.number().int().nonnegative().nullable(),
    createdAt: TimestampSchema,
  })
  .strict();

export const PersistedReviewCaseSchema = z
  .object({
    schemaVersion: z.literal(1),
    reviewCaseId: WorkflowIdentifierSchema,
    investigationId: WorkflowIdentifierSchema,
    orderId: WorkflowIdentifierSchema,
    status: z.enum(["AWAITING_REVIEW", "IN_REVIEW", "CLOSED"]),
    queue: ReviewQueueSchema,
    reasonCode: ReviewReasonCodeSchema,
    suggestedNextStep: z.string().trim().min(1),
    dedupeKey: z.string().trim().min(1),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
    closedAt: TimestampSchema.nullable(),
  })
  .strict()
  .superRefine((reviewCase, context) => {
    if (reviewCase.dedupeKey !== `human-review:${reviewCase.investigationId}`) {
      context.addIssue({
        code: "custom",
        message: "The review-case dedupe key must identify its investigation",
        path: ["dedupeKey"],
      });
    }
  });

export const ReviewCaseResultSchema = z
  .object({
    schemaVersion: z.literal(1),
    reviewCase: PersistedReviewCaseSchema,
    investigation: PersistedInvestigationSummarySchema,
    commerceStateChanged: z.literal(false),
  })
  .strict()
  .superRefine((result, context) => {
    if (
      result.reviewCase.investigationId !==
        result.investigation.investigationId ||
      result.reviewCase.orderId !== result.investigation.orderId
    ) {
      context.addIssue({
        code: "custom",
        message: "The review case must match its source investigation",
        path: ["reviewCase"],
      });
    }
  });

export const InvestigationTraceSchema = z
  .object({
    schemaVersion: z.literal(1),
    investigation: PersistedInvestigationSummarySchema,
    evidence: PersistedInvestigationEvidenceSchema.nullable(),
    auditEvents: z.array(SafeAuditEventSchema),
    commerceStateChanged: z.literal(false),
  })
  .strict()
  .superRefine((trace, context) => {
    if (
      trace.evidence !== null &&
      (trace.evidence.investigationId !== trace.investigation.investigationId ||
        trace.evidence.snapshot.orderId !== trace.investigation.orderId)
    ) {
      context.addIssue({
        code: "custom",
        message: "Trace evidence must match its investigation",
        path: ["evidence"],
      });
    }
    trace.auditEvents.forEach((event, index) => {
      if (
        event.investigationId !== trace.investigation.investigationId ||
        event.traceId !== trace.investigation.traceId
      ) {
        context.addIssue({
          code: "custom",
          message: "Trace audit events must match their investigation",
          path: ["auditEvents", index],
        });
      }
      const previous = trace.auditEvents[index - 1];
      if (
        previous &&
        (previous.createdAt > event.createdAt ||
          (previous.createdAt === event.createdAt &&
            BigInt(previous.id) >= BigInt(event.id)))
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Trace audit events must be ordered by creation time and numeric ID",
          path: ["auditEvents", index],
        });
      }
    });
  });

export const GetReviewCaseInputSchema = z
  .object({ reviewCaseId: WorkflowIdentifierSchema })
  .strict();
export const GetInvestigationTraceInputSchema = z
  .object({ investigationId: WorkflowIdentifierSchema })
  .strict();

export const WorkflowErrorCodeSchema = z.enum([
  "INVALID_INPUT",
  "ORDER_NOT_FOUND",
  "ORDER_SOURCE_UNAVAILABLE",
  "INVESTIGATION_NOT_FOUND",
  "REVIEW_CASE_NOT_FOUND",
  "INVESTIGATION_NOT_TERMINAL",
  "ESCALATION_NOT_ALLOWED",
  "IDEMPOTENCY_KEY_REUSE",
  "CLIENT_REQUEST_ID_REUSE",
  "INVALID_STORED_RESPONSE",
  "WORKFLOW_PERSISTENCE_FAILED",
]);

export type InvestigateOrderExceptionInput = z.infer<
  typeof InvestigateOrderExceptionInputSchema
>;
export type InvestigationWorkflowSuccess = z.infer<
  typeof InvestigationWorkflowSuccessSchema
>;
export type InvestigationWorkflowFailure = z.infer<
  typeof InvestigationWorkflowFailureSchema
>;
export type InvestigationWorkflowResult = z.infer<
  typeof InvestigationWorkflowResultSchema
>;
export type CreateHumanReviewEscalationInput = z.infer<
  typeof CreateHumanReviewEscalationInputSchema
>;
export type ReviewReasonCode = z.infer<typeof ReviewReasonCodeSchema>;
export type HumanReviewEscalationResult = z.infer<
  typeof HumanReviewEscalationResultSchema
>;
export type PersistedInvestigationSummary = z.infer<
  typeof PersistedInvestigationSummarySchema
>;
export type PersistedEvidenceSourceObservations = z.infer<
  typeof PersistedEvidenceSourceObservationsSchema
>;
export type PersistedInvestigationEvidence = z.infer<
  typeof PersistedInvestigationEvidenceSchema
>;
export type AuditEventType = z.infer<typeof AuditEventTypeSchema>;
export type SafeAuditEvent = z.infer<typeof SafeAuditEventSchema>;
export type PersistedReviewCase = z.infer<typeof PersistedReviewCaseSchema>;
export type ReviewCaseResult = z.infer<typeof ReviewCaseResultSchema>;
export type InvestigationTrace = z.infer<typeof InvestigationTraceSchema>;
export type GetReviewCaseInput = z.infer<typeof GetReviewCaseInputSchema>;
export type GetInvestigationTraceInput = z.infer<
  typeof GetInvestigationTraceInputSchema
>;
export type WorkflowErrorCode = z.infer<typeof WorkflowErrorCodeSchema>;
