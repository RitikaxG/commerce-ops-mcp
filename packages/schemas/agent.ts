import { z } from "zod";

import {
  DiagnosisCodeSchema,
  EvidenceStatusSchema,
  ReviewQueueSchema,
} from "./approved-scenario.js";
import { WorkflowIdentifierSchema } from "./workflow.js";

export const APPROVED_AGENT_TOOL_NAMES = [
  "list_demo_cases",
  "investigate_order_exception",
  "create_human_review_escalation",
  "get_review_case",
  "get_investigation_trace",
] as const;

export const ApprovedAgentToolNameSchema = z.enum(APPROVED_AGENT_TOOL_NAMES);

export const AgentOutcomeSchema = z.enum([
  "ANSWERED",
  "NEEDS_USER_INPUT",
  "REFUSED",
  "SAFE_ERROR",
]);

export const CommerceOperationsAgentRequestSchema = z
  .object({
    message: z.string().trim().min(1).max(4_000),
    conversationId: WorkflowIdentifierSchema.optional(),
  })
  .strict();

export const ModelExplanationSchema = z
  .object({
    summary: z.string().trim().min(1).max(800),
    reason: z.string().trim().min(1).max(1_500),
    nextStep: z.string().trim().min(1).max(1_500).nullable(),
  })
  .strict();

export const AgentToolTraceEntrySchema = z
  .object({
    sequence: z.number().int().positive(),
    toolName: ApprovedAgentToolNameSchema,
    modelArguments: z.record(z.string(), z.unknown()),
    executed: z.boolean(),
    outcome: z.enum(["SUCCESS", "SAFE_ERROR", "REJECTED"]),
    resultSummary: z.record(z.string(), z.unknown()).nullable(),
    durationMs: z.number().int().nonnegative(),
  })
  .strict();

export const AgentUsageSummarySchema = z
  .object({
    provider: z.literal("gemini"),
    model: z.string().trim().min(1).max(200),
    modelCalls: z.number().int().nonnegative(),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative(),
    estimatedCostUsd: z.number().nonnegative().nullable(),
  })
  .strict();

export const GroundingIssueCodeSchema = z.enum([
  "NEXT_STEP_MISMATCH",
  "UNSUPPORTED_DIAGNOSIS",
  "UNSUPPORTED_QUEUE",
  "INVENTED_IDENTIFIER",
  "INVENTED_WAREHOUSE",
  "FALSE_REVIEW_CASE_CLAIM",
  "FALSE_STATE_CHANGE",
  "SECRET_LIKE_CONTENT",
]);

export const GroundingValidationResultSchema = z
  .object({
    valid: z.boolean(),
    issues: z.array(GroundingIssueCodeSchema),
  })
  .strict();

export const CommerceOperationsAgentResultSchema = z
  .object({
    schemaVersion: z.literal(1),
    runId: WorkflowIdentifierSchema,
    outcome: AgentOutcomeSchema,
    message: z.string().trim().min(1).max(6_000),
    orderId: WorkflowIdentifierSchema.nullable(),
    investigationId: WorkflowIdentifierSchema.nullable(),
    reviewCaseId: WorkflowIdentifierSchema.nullable(),
    evidenceStatus: EvidenceStatusSchema.nullable(),
    diagnosisCode: DiagnosisCodeSchema.nullable(),
    shouldEscalate: z.boolean().nullable(),
    suggestedQueue: ReviewQueueSchema.nullable(),
    suggestedNextStep: z.string().trim().min(1).max(1_500).nullable(),
    eligibleAlternativeWarehouseIds: z.array(WorkflowIdentifierSchema),
    toolTrace: z.array(AgentToolTraceEntrySchema),
    usage: AgentUsageSummarySchema,
    commerceStateChanged: z.literal(false),
  })
  .strict()
  .superRefine((result, context) => {
    if (
      (result.outcome === "REFUSED" || result.outcome === "NEEDS_USER_INPUT") &&
      result.toolTrace.length > 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["toolTrace"],
        message: "Refusal and missing-input outcomes cannot execute tools",
      });
    }
    if (result.reviewCaseId !== null && result.investigationId === null) {
      context.addIssue({
        code: "custom",
        path: ["reviewCaseId"],
        message: "A review case must identify its investigation",
      });
    }
  });

export type ApprovedAgentToolName = z.infer<typeof ApprovedAgentToolNameSchema>;
export type AgentOutcome = z.infer<typeof AgentOutcomeSchema>;
export type CommerceOperationsAgentRequest = z.infer<
  typeof CommerceOperationsAgentRequestSchema
>;
export type ModelExplanation = z.infer<typeof ModelExplanationSchema>;
export type AgentToolTraceEntry = z.infer<typeof AgentToolTraceEntrySchema>;
export type AgentUsageSummary = z.infer<typeof AgentUsageSummarySchema>;
export type GroundingIssueCode = z.infer<typeof GroundingIssueCodeSchema>;
export type GroundingValidationResult = z.infer<
  typeof GroundingValidationResultSchema
>;
export type CommerceOperationsAgentResult = z.infer<
  typeof CommerceOperationsAgentResultSchema
>;
