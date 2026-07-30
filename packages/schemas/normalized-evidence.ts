import { z } from "zod";

import {
  CommerceFulfilmentEventRecordSchema,
  CommerceFulfilmentRecordSchema,
  CommerceInventoryObservationRecordSchema,
  CommerceOrderItemRecordSchema,
  CommerceOrderRecordSchema,
  CommercePaymentRecordSchema,
  CommerceShipmentRecordSchema,
  CommerceWarehouseRecordSchema,
} from "./commerce-records.js";

const TimestampSchema = z.string().datetime({ offset: true });
const NonEmptyIdentifierSchema = z.string().trim().min(1);

export const EVIDENCE_SOURCE_NAMES = [
  "ORDER",
  "ORDER_ITEMS",
  "PAYMENT",
  "FULFILMENT",
  "FULFILMENT_EVENTS",
  "SHIPMENT",
  "INVENTORY",
  "WAREHOUSES",
] as const;

export const EvidenceSourceNameSchema = z.enum(EVIDENCE_SOURCE_NAMES);
export const EvidenceSourceReadStatusSchema = z.enum([
  "SUCCEEDED",
  "FAILED",
  "SKIPPED",
]);
export const EvidenceSourceReadErrorCodeSchema = z.enum([
  "SOURCE_READ_FAILED",
  "ORDER_ITEMS_UNAVAILABLE",
  "WAREHOUSE_IDS_UNAVAILABLE",
]);

export const EvidenceSourceReadSchema = z
  .object({
    source: EvidenceSourceNameSchema,
    status: EvidenceSourceReadStatusSchema,
    readAt: TimestampSchema,
    latestSourceTimestamp: TimestampSchema.nullable(),
    recordCount: z.number().int().nonnegative(),
    errorCode: EvidenceSourceReadErrorCodeSchema.nullable(),
  })
  .strict()
  .superRefine((read, context) => {
    if (read.status === "SUCCEEDED") {
      if (read.errorCode !== null) {
        context.addIssue({
          code: "custom",
          message: "A successful source read cannot contain an error code",
          path: ["errorCode"],
        });
      }
      return;
    }

    if (read.recordCount !== 0) {
      context.addIssue({
        code: "custom",
        message: "A failed or skipped source read cannot contain records",
        path: ["recordCount"],
      });
    }
    if (read.latestSourceTimestamp !== null) {
      context.addIssue({
        code: "custom",
        message:
          "A failed or skipped source read cannot contain a source timestamp",
        path: ["latestSourceTimestamp"],
      });
    }
    if (read.errorCode === null) {
      context.addIssue({
        code: "custom",
        message: "A failed or skipped source read requires a safe error code",
        path: ["errorCode"],
      });
    }
    if (read.status === "FAILED" && read.errorCode !== "SOURCE_READ_FAILED") {
      context.addIssue({
        code: "custom",
        message: "A failed source read must use SOURCE_READ_FAILED",
        path: ["errorCode"],
      });
    }
    if (
      read.status === "SKIPPED" &&
      read.errorCode !== "ORDER_ITEMS_UNAVAILABLE" &&
      read.errorCode !== "WAREHOUSE_IDS_UNAVAILABLE"
    ) {
      context.addIssue({
        code: "custom",
        message: "A skipped source read requires a dependency error code",
        path: ["errorCode"],
      });
    }
  });

const OrderedSourceReadsSchema = z.tuple([
  EvidenceSourceReadSchema.and(z.object({ source: z.literal("ORDER") })),
  EvidenceSourceReadSchema.and(z.object({ source: z.literal("ORDER_ITEMS") })),
  EvidenceSourceReadSchema.and(z.object({ source: z.literal("PAYMENT") })),
  EvidenceSourceReadSchema.and(z.object({ source: z.literal("FULFILMENT") })),
  EvidenceSourceReadSchema.and(
    z.object({ source: z.literal("FULFILMENT_EVENTS") }),
  ),
  EvidenceSourceReadSchema.and(z.object({ source: z.literal("SHIPMENT") })),
  EvidenceSourceReadSchema.and(z.object({ source: z.literal("INVENTORY") })),
  EvidenceSourceReadSchema.and(z.object({ source: z.literal("WAREHOUSES") })),
]);

export const NormalizedOrderEvidenceSchema = z
  .object({
    schemaVersion: z.literal(1),
    orderId: NonEmptyIdentifierSchema,
    collectedAt: TimestampSchema,
    order: CommerceOrderRecordSchema.nullable(),
    orderItems: z.array(CommerceOrderItemRecordSchema),
    payment: CommercePaymentRecordSchema.nullable(),
    fulfilment: CommerceFulfilmentRecordSchema.nullable(),
    fulfilmentEvents: z.array(CommerceFulfilmentEventRecordSchema),
    shipment: CommerceShipmentRecordSchema.nullable(),
    inventoryObservations: z.array(CommerceInventoryObservationRecordSchema),
    warehouses: z.array(CommerceWarehouseRecordSchema),
    sourceReads: OrderedSourceReadsSchema,
  })
  .strict()
  .superRefine((snapshot, context) => {
    const valuesBySource = {
      ORDER: snapshot.order === null ? 0 : 1,
      ORDER_ITEMS: snapshot.orderItems.length,
      PAYMENT: snapshot.payment === null ? 0 : 1,
      FULFILMENT: snapshot.fulfilment === null ? 0 : 1,
      FULFILMENT_EVENTS: snapshot.fulfilmentEvents.length,
      SHIPMENT: snapshot.shipment === null ? 0 : 1,
      INVENTORY: snapshot.inventoryObservations.length,
      WAREHOUSES: snapshot.warehouses.length,
    } satisfies Record<EvidenceSourceName, number>;

    snapshot.sourceReads.forEach((read, index) => {
      const actualRecordCount = valuesBySource[read.source];
      if (read.recordCount !== actualRecordCount) {
        context.addIssue({
          code: "custom",
          message: `${read.source} recordCount must match its normalized value`,
          path: ["sourceReads", index, "recordCount"],
        });
      }
      if (read.status !== "SUCCEEDED" && actualRecordCount !== 0) {
        context.addIssue({
          code: "custom",
          message: `${read.source} cannot expose records after a failed or skipped read`,
          path: ["sourceReads", index, "status"],
        });
      }
    });
  });

export type EvidenceSourceName = z.infer<typeof EvidenceSourceNameSchema>;
export type EvidenceSourceReadStatus = z.infer<
  typeof EvidenceSourceReadStatusSchema
>;
export type EvidenceSourceReadErrorCode = z.infer<
  typeof EvidenceSourceReadErrorCodeSchema
>;
export type EvidenceSourceRead = z.infer<typeof EvidenceSourceReadSchema>;
export type NormalizedOrderEvidence = z.infer<
  typeof NormalizedOrderEvidenceSchema
>;
