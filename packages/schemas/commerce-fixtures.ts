import { z } from "zod";

const NonEmptyIdSchema = z.string().trim().min(1);
const TimestampSchema = z.string().datetime({ offset: true });

export const OrderStatusSchema = z.enum(["CONFIRMED", "PROCESSING"]);
export const PaymentStatusSchema = z.enum([
  "SUCCEEDED",
  "PROCESSING",
  "FAILED",
]);
export const InventorySourceSystemSchema = z.enum([
  "WAREHOUSE_SYSTEM",
  "COMMERCE_SYSTEM",
]);
export const FulfilmentStatusSchema = z.enum([
  "PENDING",
  "PROCESSING",
  "ON_HOLD",
  "FAILED",
]);
export const FulfilmentHoldReasonSchema = z.enum([
  "INVENTORY_OUT_OF_STOCK",
  "OTHER",
]);
export const FulfilmentEventTypeSchema = z.enum([
  "FULFILMENT_CREATED",
  "FULFILMENT_CREATION_FAILED",
  "PROCESSING_STARTED",
  "INVENTORY_HOLD_ADDED",
  "SHIPMENT_LABEL_CREATION_FAILED",
]);
export const FulfilmentEventStatusSchema = z.enum(["SUCCEEDED", "FAILED"]);
export const ShipmentStatusSchema = z.enum([
  "CREATED",
  "IN_TRANSIT",
  "DELIVERED",
]);

export const OrderFixtureSchema = z.object({
  id: NonEmptyIdSchema,
  status: OrderStatusSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});

export const OrderItemFixtureSchema = z.object({
  id: NonEmptyIdSchema,
  orderId: NonEmptyIdSchema,
  sku: NonEmptyIdSchema,
  quantity: z.number().int().positive(),
  createdAt: TimestampSchema,
});

export const PaymentFixtureSchema = z.object({
  id: NonEmptyIdSchema,
  orderId: NonEmptyIdSchema,
  status: PaymentStatusSchema,
  amount: z.string().regex(/^\d{1,10}\.\d{2}$/),
  currency: z.string().regex(/^[A-Z]{3}$/),
  providerReference: NonEmptyIdSchema.nullable(),
  observedAt: TimestampSchema,
});

export const WarehouseFixtureSchema = z.object({
  id: NonEmptyIdSchema,
  name: z.string().trim().min(1),
  active: z.boolean(),
  createdAt: TimestampSchema,
});

export const InventoryObservationFixtureSchema = z.object({
  warehouseId: NonEmptyIdSchema,
  sku: NonEmptyIdSchema,
  sourceSystem: InventorySourceSystemSchema,
  availableQuantity: z.number().int().nonnegative(),
  observedAt: TimestampSchema,
});

export const FulfilmentFixtureSchema = z
  .object({
    id: NonEmptyIdSchema,
    orderId: NonEmptyIdSchema,
    status: FulfilmentStatusSchema,
    holdReason: FulfilmentHoldReasonSchema.nullable(),
    assignedWarehouseId: NonEmptyIdSchema.nullable(),
    providerReference: NonEmptyIdSchema.nullable(),
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

export const FulfilmentEventFixtureSchema = z.object({
  id: NonEmptyIdSchema,
  orderId: NonEmptyIdSchema,
  fulfilmentId: NonEmptyIdSchema.nullable(),
  sourceEventReference: NonEmptyIdSchema.nullable(),
  type: FulfilmentEventTypeSchema,
  status: FulfilmentEventStatusSchema,
  details: z.record(z.string(), z.unknown()),
  occurredAt: TimestampSchema,
});

export const ShipmentFixtureSchema = z.object({
  id: NonEmptyIdSchema,
  orderId: NonEmptyIdSchema,
  fulfilmentId: NonEmptyIdSchema.nullable(),
  status: ShipmentStatusSchema,
  providerReference: NonEmptyIdSchema.nullable(),
  createdAt: TimestampSchema,
  observedAt: TimestampSchema,
});

export const CommerceFixtureSetSchema = z.object({
  orders: z.array(OrderFixtureSchema),
  orderItems: z.array(OrderItemFixtureSchema),
  payments: z.array(PaymentFixtureSchema),
  warehouses: z.array(WarehouseFixtureSchema),
  inventoryObservations: z.array(InventoryObservationFixtureSchema),
  fulfilments: z.array(FulfilmentFixtureSchema),
  fulfilmentEvents: z.array(FulfilmentEventFixtureSchema),
  shipments: z.array(ShipmentFixtureSchema),
});

export type OrderFixture = z.infer<typeof OrderFixtureSchema>;
export type OrderItemFixture = z.infer<typeof OrderItemFixtureSchema>;
export type PaymentFixture = z.infer<typeof PaymentFixtureSchema>;
export type WarehouseFixture = z.infer<typeof WarehouseFixtureSchema>;
export type InventoryObservationFixture = z.infer<
  typeof InventoryObservationFixtureSchema
>;
export type FulfilmentFixture = z.infer<typeof FulfilmentFixtureSchema>;
export type FulfilmentEventFixture = z.infer<
  typeof FulfilmentEventFixtureSchema
>;
export type ShipmentFixture = z.infer<typeof ShipmentFixtureSchema>;
export type CommerceFixtureSet = z.infer<typeof CommerceFixtureSetSchema>;
