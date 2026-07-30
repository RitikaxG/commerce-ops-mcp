import { z } from "zod";

import {
  HumanReviewEscalationResultSchema,
  InvestigationTraceSchema,
  InvestigationWorkflowResultSchema,
  ReviewCaseResultSchema,
  WorkflowErrorCodeSchema,
  WorkflowIdentifierSchema,
} from "./workflow.js";

export const MCP_SAFE_ERROR_MESSAGES = [
  "The workflow input is invalid.",
  "The requested order was not found.",
  "The order source is unavailable.",
  "The requested investigation was not found.",
  "The requested review case was not found.",
  "The investigation has not reached a terminal state.",
  "The investigation outcome does not require human action.",
  "The idempotency key was already used for different input.",
  "The client request ID was already used for a different order.",
  "A stored workflow response failed contract validation.",
  "The workflow result could not be persisted safely.",
  "The tool could not complete safely.",
] as const;

export const McpToolErrorCodeSchema = z.union([
  WorkflowErrorCodeSchema,
  z.literal("INTERNAL_ERROR"),
]);

export const McpToolErrorMessageSchema = z.enum(MCP_SAFE_ERROR_MESSAGES);

export const McpToolErrorSchema = z
  .object({
    code: McpToolErrorCodeSchema,
    message: McpToolErrorMessageSchema,
  })
  .strict();

export const McpToolFailureSchema = z
  .object({
    schemaVersion: z.literal(1),
    ok: z.literal(false),
    error: McpToolErrorSchema,
    commerceStateChanged: z.literal(false),
  })
  .strict();

export const DemoCaseCategorySchema = z.enum([
  "INVENTORY",
  "FULFILMENT",
  "PROCESSING",
  "SHIPPING",
  "DATA_QUALITY",
  "SHIPMENT",
  "GENERAL",
  "PAYMENT",
]);

export const DemoCaseSchema = z
  .object({
    orderId: WorkflowIdentifierSchema,
    title: z.string().trim().min(1).max(300),
    category: DemoCaseCategorySchema,
  })
  .strict();

export const ListDemoCasesResultSchema = z
  .object({
    schemaVersion: z.literal(1),
    purpose: z.literal("DEMO_DISCOVERY_ONLY"),
    cases: z
      .array(DemoCaseSchema)
      .length(9)
      .superRefine((cases, context) => {
        const orderIds = cases.map(({ orderId }) => orderId);
        if (new Set(orderIds).size !== orderIds.length) {
          context.addIssue({
            code: "custom",
            message: "Demo case order IDs must be unique",
          });
        }
      }),
    commerceStateChanged: z.literal(false),
  })
  .strict();

export const ListDemoCasesInputSchema = z.object({}).strict();

export function createMcpToolSuccessSchema<ResultSchema extends z.ZodType>(
  resultSchema: ResultSchema,
) {
  return z
    .object({
      schemaVersion: z.literal(1),
      ok: z.literal(true),
      result: resultSchema,
    })
    .strict();
}

/**
 * MCP outputSchema must describe a top-level object. A discriminated Zod union
 * is precise in TypeScript but is not transported consistently by the v1 SDK.
 * This object-compatible schema retains the same success/failure invariants via
 * superRefine, while handlers still parse the exact concrete envelope before
 * returning structuredContent.
 */
export function createMcpToolOutputSchema<ResultSchema extends z.ZodType>(
  resultSchema: ResultSchema,
) {
  return z
    .object({
      schemaVersion: z.literal(1),
      ok: z.boolean(),
      result: resultSchema.optional(),
      error: McpToolErrorSchema.optional(),
      commerceStateChanged: z.literal(false).optional(),
    })
    .strict()
    .superRefine((value, context) => {
      if (value.ok) {
        if (value.result === undefined) {
          context.addIssue({
            code: "custom",
            path: ["result"],
            message: "Successful MCP output requires result",
          });
        }
        if (value.error !== undefined) {
          context.addIssue({
            code: "custom",
            path: ["error"],
            message: "Successful MCP output cannot include error",
          });
        }
        if (value.commerceStateChanged !== undefined) {
          context.addIssue({
            code: "custom",
            path: ["commerceStateChanged"],
            message:
              "Successful MCP envelope must keep commerce state on its result",
          });
        }
        return;
      }

      if (value.result !== undefined) {
        context.addIssue({
          code: "custom",
          path: ["result"],
          message: "Failed MCP output cannot include result",
        });
      }
      if (value.error === undefined) {
        context.addIssue({
          code: "custom",
          path: ["error"],
          message: "Failed MCP output requires error",
        });
      }
      if (value.commerceStateChanged !== false) {
        context.addIssue({
          code: "custom",
          path: ["commerceStateChanged"],
          message: "Failed MCP output must preserve commerce state",
        });
      }
    });
}

export const ListDemoCasesToolSuccessSchema = createMcpToolSuccessSchema(
  ListDemoCasesResultSchema,
);
export const InvestigateOrderExceptionToolSuccessSchema =
  createMcpToolSuccessSchema(InvestigationWorkflowResultSchema);
export const CreateHumanReviewEscalationToolSuccessSchema =
  createMcpToolSuccessSchema(HumanReviewEscalationResultSchema);
export const GetReviewCaseToolSuccessSchema =
  createMcpToolSuccessSchema(ReviewCaseResultSchema);
export const GetInvestigationTraceToolSuccessSchema =
  createMcpToolSuccessSchema(InvestigationTraceSchema);

export const ListDemoCasesToolOutputSchema = createMcpToolOutputSchema(
  ListDemoCasesResultSchema,
);
export const InvestigateOrderExceptionToolOutputSchema =
  createMcpToolOutputSchema(InvestigationWorkflowResultSchema);
export const CreateHumanReviewEscalationToolOutputSchema =
  createMcpToolOutputSchema(HumanReviewEscalationResultSchema);
export const GetReviewCaseToolOutputSchema =
  createMcpToolOutputSchema(ReviewCaseResultSchema);
export const GetInvestigationTraceToolOutputSchema =
  createMcpToolOutputSchema(InvestigationTraceSchema);

export type McpToolErrorCode = z.infer<typeof McpToolErrorCodeSchema>;
export type McpToolFailure = z.infer<typeof McpToolFailureSchema>;
export type DemoCaseCategory = z.infer<typeof DemoCaseCategorySchema>;
export type DemoCase = z.infer<typeof DemoCaseSchema>;
export type ListDemoCasesResult = z.infer<typeof ListDemoCasesResultSchema>;
export type ListDemoCasesInput = z.infer<typeof ListDemoCasesInputSchema>;
export type McpToolSuccess<Result> = {
  schemaVersion: 1;
  ok: true;
  result: Result;
};
export type McpToolOutput<Result> = McpToolSuccess<Result> | McpToolFailure;
