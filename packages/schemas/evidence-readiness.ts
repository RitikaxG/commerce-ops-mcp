import { z } from "zod";

import { EvidenceStatusSchema } from "./approved-scenario.js";
import { InventorySourceSystemSchema } from "./commerce-fixtures.js";

const TimestampSchema = z.string().datetime({ offset: true });
const NonEmptyPathSegmentSchema = String.raw`[^.]+`;

export const EVIDENCE_SOURCE_MISSING_PATHS = [
  "sources.ORDER",
  "sources.ORDER_ITEMS",
  "sources.PAYMENT",
  "sources.FULFILMENT",
  "sources.FULFILMENT_EVENTS",
  "sources.SHIPMENT",
  "sources.INVENTORY",
  "sources.WAREHOUSES",
] as const;

export const EvidenceMissingFieldPathSchema = z.union([
  z.enum(EVIDENCE_SOURCE_MISSING_PATHS),
  z.enum([
    "order",
    "orderItems",
    "payment",
    "fulfilment",
    "fulfilment.assignedWarehouseId",
  ]),
  z.string().regex(new RegExp(`^warehouses\\.${NonEmptyPathSegmentSchema}$`)),
  z
    .string()
    .regex(
      new RegExp(
        `^inventory\\.assignedWarehouse\\.${NonEmptyPathSegmentSchema}\\.${NonEmptyPathSegmentSchema}$`,
      ),
    ),
]);

export const EvidenceConflictObservationSchema = z
  .object({
    sourceSystem: InventorySourceSystemSchema,
    availableQuantity: z.number().int().nonnegative(),
    observedAt: TimestampSchema,
  })
  .strict();

const inventorySourceOrder = {
  WAREHOUSE_SYSTEM: 0,
  COMMERCE_SYSTEM: 1,
} as const;

export const EvidenceConflictSchema = z
  .object({
    code: z.literal("INVENTORY_QUANTITY_MISMATCH"),
    path: z
      .string()
      .regex(
        new RegExp(
          `^inventory\\.${NonEmptyPathSegmentSchema}\\.${NonEmptyPathSegmentSchema}\\.availableQuantity$`,
        ),
      ),
    message: z.string().trim().min(1),
    observations: z.array(EvidenceConflictObservationSchema).min(2),
  })
  .strict()
  .superRefine((conflict, context) => {
    const distinctSources = new Set(
      conflict.observations.map(({ sourceSystem }) => sourceSystem),
    );
    if (distinctSources.size < 2) {
      context.addIssue({
        code: "custom",
        message: "A conflict requires at least two distinct source systems",
        path: ["observations"],
      });
    }

    for (let index = 1; index < conflict.observations.length; index += 1) {
      const previous = conflict.observations[index - 1];
      const current = conflict.observations[index];
      if (
        previous &&
        current &&
        inventorySourceOrder[previous.sourceSystem] >
          inventorySourceOrder[current.sourceSystem]
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Conflict observations must use deterministic source-system order",
          path: ["observations", index, "sourceSystem"],
        });
      }
    }
  });

export const EvidenceReadinessResultSchema = z
  .object({
    schemaVersion: z.literal(1),
    orderId: z.string().trim().min(1),
    evidenceStatus: EvidenceStatusSchema,
    missingFields: z.array(EvidenceMissingFieldPathSchema),
    conflicts: z.array(EvidenceConflictSchema),
  })
  .strict()
  .superRefine((result, context) => {
    for (let index = 1; index < result.missingFields.length; index += 1) {
      const previous = result.missingFields[index - 1];
      const current = result.missingFields[index];
      if (previous && current && previous >= current) {
        context.addIssue({
          code: "custom",
          message: "Missing fields must be unique and lexically ordered",
          path: ["missingFields", index],
        });
      }
    }

    for (let index = 1; index < result.conflicts.length; index += 1) {
      const previous = result.conflicts[index - 1];
      const current = result.conflicts[index];
      if (previous && current && previous.path >= current.path) {
        context.addIssue({
          code: "custom",
          message: "Conflicts must have unique, lexically ordered paths",
          path: ["conflicts", index, "path"],
        });
      }
    }

    if (
      result.evidenceStatus === "COMPLETE" &&
      (result.missingFields.length !== 0 || result.conflicts.length !== 0)
    ) {
      context.addIssue({
        code: "custom",
        message: "Complete evidence cannot contain missing fields or conflicts",
        path: ["evidenceStatus"],
      });
    }

    if (
      result.evidenceStatus === "MISSING" &&
      (result.missingFields.length === 0 || result.conflicts.length !== 0)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Missing evidence requires missing fields and cannot contain conflicts",
        path: ["evidenceStatus"],
      });
    }

    if (
      result.evidenceStatus === "CONFLICTING" &&
      result.conflicts.length === 0
    ) {
      context.addIssue({
        code: "custom",
        message: "Conflicting evidence requires a structured conflict",
        path: ["evidenceStatus"],
      });
    }
  });

export type EvidenceMissingFieldPath = z.infer<
  typeof EvidenceMissingFieldPathSchema
>;
export type EvidenceConflictObservation = z.infer<
  typeof EvidenceConflictObservationSchema
>;
export type EvidenceConflict = z.infer<typeof EvidenceConflictSchema>;
export type EvidenceReadinessResult = z.infer<
  typeof EvidenceReadinessResultSchema
>;
