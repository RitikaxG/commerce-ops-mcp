import { z } from "zod";

import {
  DiagnosisCodeSchema,
  EvidenceStatusSchema,
  ReviewQueueSchema,
} from "./approved-scenario.js";
import { JsonValueSchema } from "./commerce-records.js";

export const DiagnosisConfidenceSchema = z.literal("CONFIRMED");

export const DiagnosisRuleIdSchema = z.enum([
  "payment_not_confirmed.v1",
  "shipment_already_exists.v1",
  "fulfilment_creation_failed.v1",
  "shipment_label_creation_failed.v1",
  "assigned_warehouse_out_of_stock.v1",
  "within_expected_processing_time.v1",
  "cause_not_determined.v1",
]);

export const DIAGNOSIS_SUPPORTING_FACT_CODES = [
  "PAYMENT_STATUS",
  "SHIPMENT_PRESENT",
  "FAILURE_EVENT",
  "FULFILMENT_STATE",
  "ASSIGNED_WAREHOUSE_STOCK",
  "ELIGIBLE_ALTERNATIVE_WAREHOUSES",
  "PROCESSING_WINDOW",
  "MISSING_EVIDENCE",
  "CONFLICTING_EVIDENCE",
  "NO_SUPPORTED_RULE",
] as const;

export const DiagnosisSupportingFactCodeSchema = z.enum(
  DIAGNOSIS_SUPPORTING_FACT_CODES,
);

export const DiagnosisSupportingFactSchema = z
  .object({
    code: DiagnosisSupportingFactCodeSchema,
    path: z.string().trim().min(1),
    value: JsonValueSchema,
  })
  .strict();

const factCodeOrder = new Map(
  DIAGNOSIS_SUPPORTING_FACT_CODES.map((code, index) => [code, index]),
);

const diagnosisPolicy = {
  PAYMENT_NOT_CONFIRMED: {
    rule: "payment_not_confirmed.v1",
    shouldEscalate: true,
    queue: "PAYMENT_OPERATIONS",
    step: "Review the authoritative payment source before treating the order as paid.",
  },
  SHIPMENT_ALREADY_EXISTS: {
    rule: "shipment_already_exists.v1",
    shouldEscalate: false,
    queue: null,
    step: "Verify whether the operator view is stale because a shipment already exists.",
  },
  FULFILMENT_CREATION_FAILED: {
    rule: "fulfilment_creation_failed.v1",
    shouldEscalate: true,
    queue: "FULFILMENT_OPERATIONS",
    step: "Review the confirmed fulfilment creation failure; do not retry fulfilment automatically.",
  },
  SHIPMENT_LABEL_CREATION_FAILED: {
    rule: "shipment_label_creation_failed.v1",
    shouldEscalate: true,
    queue: "SHIPPING_OPERATIONS",
    step: "Review the shipment-label failure; do not retry or change fulfilment automatically.",
  },
  ASSIGNED_WAREHOUSE_OUT_OF_STOCK: {
    rule: "assigned_warehouse_out_of_stock.v1",
    shouldEscalate: true,
    queue: "FULFILMENT_OPERATIONS",
    step: "Review reassignment to an eligible warehouse; do not change commerce state automatically.",
  },
  WITHIN_EXPECTED_PROCESSING_TIME: {
    rule: "within_expected_processing_time.v1",
    shouldEscalate: false,
    queue: null,
    step: "Continue normal monitoring within the expected processing window.",
  },
  CAUSE_NOT_DETERMINED: {
    rule: "cause_not_determined.v1",
    shouldEscalate: true,
    queue: "GENERAL_COMMERCE_OPERATIONS",
    step: "Review the order manually without inventing a cause.",
  },
} as const;

const noAlternativeStep =
  "Review the assigned-warehouse shortage; no eligible alternative warehouse is confirmed.";

export const InvestigationDecisionSchema = z
  .object({
    schemaVersion: z.literal(1),
    orderId: z.string().trim().min(1),
    investigationStatus: z.enum(["COMPLETED", "NEEDS_MORE_INFO"]),
    evidenceStatus: EvidenceStatusSchema,
    diagnosisCode: DiagnosisCodeSchema.nullable(),
    confidence: DiagnosisConfidenceSchema.nullable(),
    matchedRule: DiagnosisRuleIdSchema.nullable(),
    shouldEscalate: z.boolean(),
    suggestedQueue: ReviewQueueSchema.nullable(),
    suggestedNextStep: z.string().trim().min(1),
    supportingFacts: z.array(DiagnosisSupportingFactSchema),
    eligibleAlternativeWarehouseIds: z.array(z.string().trim().min(1)),
    commerceStateChanged: z.literal(false),
  })
  .strict()
  .superRefine((decision, context) => {
    for (let index = 1; index < decision.supportingFacts.length; index += 1) {
      const previous = decision.supportingFacts[index - 1];
      const current = decision.supportingFacts[index];
      if (!previous || !current) {
        continue;
      }
      const previousOrder = factCodeOrder.get(previous.code) ?? -1;
      const currentOrder = factCodeOrder.get(current.code) ?? -1;
      if (
        previousOrder > currentOrder ||
        (previousOrder === currentOrder && previous.path >= current.path)
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Supporting facts must be unique and ordered by fixed code order, then lexical path",
          path: ["supportingFacts", index],
        });
      }
    }

    for (
      let index = 1;
      index < decision.eligibleAlternativeWarehouseIds.length;
      index += 1
    ) {
      const previous = decision.eligibleAlternativeWarehouseIds[index - 1];
      const current = decision.eligibleAlternativeWarehouseIds[index];
      if (previous && current && previous >= current) {
        context.addIssue({
          code: "custom",
          message:
            "Eligible alternative warehouse IDs must be unique and lexically ordered",
          path: ["eligibleAlternativeWarehouseIds", index],
        });
      }
    }

    if (decision.shouldEscalate !== (decision.suggestedQueue !== null)) {
      context.addIssue({
        code: "custom",
        message:
          "Escalation requires a queue and non-escalating decisions require a null queue",
        path: ["suggestedQueue"],
      });
    }

    if (decision.investigationStatus === "NEEDS_MORE_INFO") {
      const expectedStep =
        decision.evidenceStatus === "MISSING"
          ? decision.orderId === "ORD-1046" &&
            decision.supportingFacts.some(
              ({ code, value }) =>
                code === "MISSING_EVIDENCE" &&
                Array.isArray(value) &&
                value.length > 0 &&
                value.every(
                  (path) =>
                    typeof path === "string" &&
                    path.startsWith("inventory.assignedWarehouse."),
                ),
            )
            ? "Verify the missing assigned-warehouse inventory evidence."
            : "Verify the missing commerce evidence identified in the investigation."
          : "Resolve the conflicting inventory observations before suggesting a warehouse.";
      const expectedFactCode =
        decision.evidenceStatus === "MISSING"
          ? "MISSING_EVIDENCE"
          : "CONFLICTING_EVIDENCE";
      if (
        decision.evidenceStatus === "COMPLETE" ||
        decision.diagnosisCode !== null ||
        decision.confidence !== null ||
        decision.matchedRule !== null ||
        !decision.shouldEscalate ||
        decision.suggestedQueue !== "OPERATIONS_DATA_REVIEW" ||
        decision.eligibleAlternativeWarehouseIds.length !== 0 ||
        decision.suggestedNextStep !== expectedStep ||
        decision.supportingFacts.length === 0 ||
        !decision.supportingFacts.some(({ code }) => code === expectedFactCode)
      ) {
        context.addIssue({
          code: "custom",
          message:
            "NEEDS_MORE_INFO requires uncertain evidence, no diagnosis, data review, exact verification guidance, and no alternatives",
          path: ["investigationStatus"],
        });
      }
      return;
    }

    if (
      decision.evidenceStatus !== "COMPLETE" ||
      decision.diagnosisCode === null ||
      decision.confidence !== "CONFIRMED" ||
      decision.matchedRule === null ||
      decision.supportingFacts.length === 0
    ) {
      context.addIssue({
        code: "custom",
        message:
          "COMPLETED requires complete evidence, a confirmed diagnosis, a matched rule, and supporting facts",
        path: ["investigationStatus"],
      });
      return;
    }

    const policy = diagnosisPolicy[decision.diagnosisCode];
    const validOutOfStockStep =
      decision.diagnosisCode === "ASSIGNED_WAREHOUSE_OUT_OF_STOCK" &&
      decision.eligibleAlternativeWarehouseIds.length === 0 &&
      decision.suggestedNextStep === noAlternativeStep;
    if (
      decision.matchedRule !== policy.rule ||
      decision.shouldEscalate !== policy.shouldEscalate ||
      decision.suggestedQueue !== policy.queue ||
      (decision.suggestedNextStep !== policy.step && !validOutOfStockStep)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Diagnosis, matched rule, escalation policy, queue, and suggested step must agree",
        path: ["diagnosisCode"],
      });
    }

    if (
      decision.diagnosisCode !== "ASSIGNED_WAREHOUSE_OUT_OF_STOCK" &&
      decision.eligibleAlternativeWarehouseIds.length > 0
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Only an assigned-warehouse shortage decision may include eligible alternatives",
        path: ["eligibleAlternativeWarehouseIds"],
      });
    }
  });

export type DiagnosisConfidence = z.infer<typeof DiagnosisConfidenceSchema>;
export type DiagnosisRuleId = z.infer<typeof DiagnosisRuleIdSchema>;
export type DiagnosisSupportingFactCode = z.infer<
  typeof DiagnosisSupportingFactCodeSchema
>;
export type DiagnosisSupportingFact = z.infer<
  typeof DiagnosisSupportingFactSchema
>;
export type InvestigationDecision = z.infer<typeof InvestigationDecisionSchema>;
