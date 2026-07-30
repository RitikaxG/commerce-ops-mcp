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

export const McpToolFailureSchema = z
  .object({
    schemaVersion: z.literal(1),
    ok: z.literal(false),
    error: z
      .object({
        code: McpToolErrorCodeSchema,
        message: McpToolErrorMessageSchema,
      })
      .strict(),
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

// The MCP SDK validates structuredContent against outputSchema even when a
// tool returns isError=true. Each registered tool therefore advertises the
// complete discriminated envelope rather than only its success shape.
export const ListDemoCasesToolOutputSchema = z.discriminatedUnion("ok", [
  ListDemoCasesToolSuccessSchema,
  McpToolFailureSchema,
]);
export const InvestigateOrderExceptionToolOutputSchema = z.discriminatedUnion(
  "ok",
  [InvestigateOrderExceptionToolSuccessSchema, McpToolFailureSchema],
);
export const CreateHumanReviewEscalationToolOutputSchema =
  z.discriminatedUnion("ok", [
    CreateHumanReviewEscalationToolSuccessSchema,
    McpToolFailureSchema,
  ]);
export const GetReviewCaseToolOutputSchema = z.discriminatedUnion("ok", [
  GetReviewCaseToolSuccessSchema,
  McpToolFailureSchema,
]);
export const GetInvestigationTraceToolOutputSchema = z.discriminatedUnion(
  "ok",
  [GetInvestigationTraceToolSuccessSchema, McpToolFailureSchema],
);

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
