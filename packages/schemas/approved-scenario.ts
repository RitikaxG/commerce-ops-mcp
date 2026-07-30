import { z } from "zod";

export const EvidenceStatusSchema = z.enum([
  "COMPLETE",
  "MISSING",
  "CONFLICTING",
]);

export const ExpectedInvestigationStatusSchema = z.enum([
  "COMPLETED",
  "NEEDS_MORE_INFO",
]);

export const DiagnosisCodeSchema = z.enum([
  "ASSIGNED_WAREHOUSE_OUT_OF_STOCK",
  "FULFILMENT_CREATION_FAILED",
  "WITHIN_EXPECTED_PROCESSING_TIME",
  "SHIPMENT_LABEL_CREATION_FAILED",
  "SHIPMENT_ALREADY_EXISTS",
  "PAYMENT_NOT_CONFIRMED",
  "CAUSE_NOT_DETERMINED",
]);

export const ReviewQueueSchema = z.enum([
  "FULFILMENT_OPERATIONS",
  "SHIPPING_OPERATIONS",
  "PAYMENT_OPERATIONS",
  "OPERATIONS_DATA_REVIEW",
  "GENERAL_COMMERCE_OPERATIONS",
]);

export const ApprovedScenarioSchema = z
  .object({
    orderId: z.string().trim().min(1),
    title: z.string().trim().min(1),
    expectedEvidenceStatus: EvidenceStatusSchema,
    expectedInvestigationStatus: ExpectedInvestigationStatusSchema,
    expectedDiagnosis: DiagnosisCodeSchema.nullable(),
    shouldEscalate: z.boolean(),
    expectedQueue: ReviewQueueSchema.nullable(),
    expectedSuggestedNextStep: z.string().trim().min(1),
    expectedCommerceStateChanged: z.literal(false),
  })
  .superRefine((scenario, context) => {
    if (scenario.shouldEscalate && scenario.expectedQueue === null) {
      context.addIssue({
        code: "custom",
        message: "Escalating scenarios require an expected queue",
        path: ["expectedQueue"],
      });
    }

    if (!scenario.shouldEscalate && scenario.expectedQueue !== null) {
      context.addIssue({
        code: "custom",
        message: "Non-escalating scenarios must use a null queue",
        path: ["expectedQueue"],
      });
    }

    const needsMoreInfo =
      scenario.expectedInvestigationStatus === "NEEDS_MORE_INFO";
    if (needsMoreInfo && scenario.expectedDiagnosis !== null) {
      context.addIssue({
        code: "custom",
        message: "NEEDS_MORE_INFO scenarios cannot have a diagnosis",
        path: ["expectedDiagnosis"],
      });
    }

    if (!needsMoreInfo && scenario.expectedDiagnosis === null) {
      context.addIssue({
        code: "custom",
        message: "COMPLETED scenarios require a diagnosis",
        path: ["expectedDiagnosis"],
      });
    }
  });

export const ApprovedScenarioManifestSchema = z
  .array(ApprovedScenarioSchema)
  .length(9);

export type EvidenceStatus = z.infer<typeof EvidenceStatusSchema>;
export type ExpectedInvestigationStatus = z.infer<
  typeof ExpectedInvestigationStatusSchema
>;
export type DiagnosisCode = z.infer<typeof DiagnosisCodeSchema>;
export type ReviewQueue = z.infer<typeof ReviewQueueSchema>;
export type ApprovedScenario = z.infer<typeof ApprovedScenarioSchema>;
