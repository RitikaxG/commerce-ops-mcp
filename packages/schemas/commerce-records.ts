import { z } from "zod";

import {
  FulfilmentEventStatusSchema,
  FulfilmentEventTypeSchema,
  FulfilmentHoldReasonSchema,
  FulfilmentStatusSchema,
  InventorySourceSystemSchema,
  OrderStatusSchema,
  PaymentStatusSchema,
  ShipmentStatusSchema,
} from "./commerce-fixtures.js";

const NonEmptyIdentifierSchema = z.string().trim().min(1);
const TimestampSchema = z.string().datetime({ offset: true });

export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
);

export const CommerceOrderRecordSchema = z.object({
  id: NonEmptyIdentifierSchema,
  status: OrderStatusSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});

export const CommerceOrderItemRecordSchema = z.object({
  id: NonEmptyIdentifierSchema,
  orderId: NonEmptyIdentifierSchema,
  sku: NonEmptyIdentifierSchema,
  quantity: z.number().int().positive(),
  createdAt: TimestampSchema,
});

export const CommercePaymentRecordSchema = z.object({
  id: NonEmptyIdentifierSchema,
  orderId: NonEmptyIdentifierSchema,
  status: PaymentStatusSchema,
  amount: z.string().regex(/^\d{1,10}\.\d{2}$/),
  currency: z.string().regex(/^[A-Z]{3}$/),
  providerReference: NonEmptyIdentifierSchema.nullable(),
  observedAt: TimestampSchema,
});

export const CommerceWarehouseRecordSchema = z.object({
  id: NonEmptyIdentifierSchema,
  name: z.string().trim().min(1),
  active: z.boolean(),
  createdAt: TimestampSchema,
});

export const CommerceInventoryObservationRecordSchema = z.object({
  warehouseId: NonEmptyIdentifierSchema,
  sku: NonEmptyIdentifierSchema,
  sourceSystem: InventorySourceSystemSchema,
  availableQuantity: z.number().int().nonnegative(),
  observedAt: TimestampSchema,
});

export const CommerceFulfilmentRecordSchema = z
  .object({
    id: NonEmptyIdentifierSchema,
    orderId: NonEmptyIdentifierSchema,
    status: FulfilmentStatusSchema,
    holdReason: FulfilmentHoldReasonSchema.nullable(),
    assignedWarehouseId: NonEmptyIdentifierSchema.nullable(),
    providerReference: NonEmptyIdentifierSchema.nullable(),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
    observedAt: TimestampSchema,
  })
  .superRefine((fulfilment, context) => {
    const requiresHoldReason = fulfilment.status === "ON_HOLD";
    if (requiresHoldReason !== (fulfilment.holdReason !== null)) {
      context.addIssue({
        code: "custom",
        message:
          "A hold reason is required only when fulfilment status is ON_HOLD",
        path: ["holdReason"],
      });
    }
  });

export const CommerceFulfilmentEventRecordSchema = z.object({
  id: NonEmptyIdentifierSchema,
  orderId: NonEmptyIdentifierSchema,
  fulfilmentId: NonEmptyIdentifierSchema.nullable(),
  sourceEventReference: NonEmptyIdentifierSchema.nullable(),
  type: FulfilmentEventTypeSchema,
  status: FulfilmentEventStatusSchema,
  details: JsonValueSchema,
  occurredAt: TimestampSchema,
});

export const CommerceShipmentRecordSchema = z.object({
  id: NonEmptyIdentifierSchema,
  orderId: NonEmptyIdentifierSchema,
  fulfilmentId: NonEmptyIdentifierSchema.nullable(),
  status: ShipmentStatusSchema,
  providerReference: NonEmptyIdentifierSchema.nullable(),
  createdAt: TimestampSchema,
  observedAt: TimestampSchema,
});

export type CommerceOrderRecord = z.infer<typeof CommerceOrderRecordSchema>;
export type CommerceOrderItemRecord = z.infer<
  typeof CommerceOrderItemRecordSchema
>;
export type CommercePaymentRecord = z.infer<typeof CommercePaymentRecordSchema>;
export type CommerceWarehouseRecord = z.infer<
  typeof CommerceWarehouseRecordSchema
>;
export type CommerceInventoryObservationRecord = z.infer<
  typeof CommerceInventoryObservationRecordSchema
>;
export type CommerceFulfilmentRecord = z.infer<
  typeof CommerceFulfilmentRecordSchema
>;
export type CommerceFulfilmentEventRecord = z.infer<
  typeof CommerceFulfilmentEventRecordSchema
>;
export type CommerceShipmentRecord = z.infer<
  typeof CommerceShipmentRecordSchema
>;
