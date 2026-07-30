import {
  CommerceFulfilmentEventRecordSchema,
  CommerceFulfilmentRecordSchema,
  CommerceInventoryObservationRecordSchema,
  CommerceOrderItemRecordSchema,
  CommerceOrderRecordSchema,
  CommercePaymentRecordSchema,
  CommerceShipmentRecordSchema,
  CommerceWarehouseRecordSchema,
  type CommerceFulfilmentEventRecord,
  type CommerceFulfilmentRecord,
  type CommerceInventoryObservationRecord,
  type CommerceOrderItemRecord,
  type CommerceOrderRecord,
  type CommercePaymentRecord,
  type CommerceShipmentRecord,
  type CommerceWarehouseRecord,
} from "@repo/schemas";
import { z } from "zod";

import { createWorkflowDatabaseClient } from "./client.js";
import { type Prisma, type PrismaClient } from "./generated/prisma/client.js";

const IdentifierSchema = z.string().trim().min(1);
const IdentifierListSchema = z.array(IdentifierSchema);

const orderSelection = {
  id: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.OrderSelect;

const orderItemSelection = {
  id: true,
  orderId: true,
  sku: true,
  quantity: true,
  createdAt: true,
} satisfies Prisma.OrderItemSelect;

const paymentSelection = {
  id: true,
  orderId: true,
  status: true,
  amount: true,
  currency: true,
  providerReference: true,
  observedAt: true,
} satisfies Prisma.PaymentSelect;

const warehouseSelection = {
  id: true,
  name: true,
  active: true,
  createdAt: true,
} satisfies Prisma.WarehouseSelect;

const inventoryObservationSelection = {
  warehouseId: true,
  sku: true,
  sourceSystem: true,
  availableQuantity: true,
  observedAt: true,
} satisfies Prisma.InventoryObservationSelect;

const fulfilmentSelection = {
  id: true,
  orderId: true,
  status: true,
  holdReason: true,
  assignedWarehouseId: true,
  providerReference: true,
  createdAt: true,
  updatedAt: true,
  observedAt: true,
} satisfies Prisma.FulfilmentSelect;

const fulfilmentEventSelection = {
  id: true,
  orderId: true,
  fulfilmentId: true,
  sourceEventReference: true,
  type: true,
  status: true,
  details: true,
  occurredAt: true,
} satisfies Prisma.FulfilmentEventSelect;

const shipmentSelection = {
  id: true,
  orderId: true,
  fulfilmentId: true,
  status: true,
  providerReference: true,
  createdAt: true,
  observedAt: true,
} satisfies Prisma.ShipmentSelect;

type OrderRow = Prisma.OrderGetPayload<{ select: typeof orderSelection }>;
type OrderItemRow = Prisma.OrderItemGetPayload<{
  select: typeof orderItemSelection;
}>;
type PaymentRow = Prisma.PaymentGetPayload<{
  select: typeof paymentSelection;
}>;
type WarehouseRow = Prisma.WarehouseGetPayload<{
  select: typeof warehouseSelection;
}>;
type InventoryObservationRow = Prisma.InventoryObservationGetPayload<{
  select: typeof inventoryObservationSelection;
}>;
type FulfilmentRow = Prisma.FulfilmentGetPayload<{
  select: typeof fulfilmentSelection;
}>;
type FulfilmentEventRow = Prisma.FulfilmentEventGetPayload<{
  select: typeof fulfilmentEventSelection;
}>;
type ShipmentRow = Prisma.ShipmentGetPayload<{
  select: typeof shipmentSelection;
}>;

function timestamp(value: Date): string {
  return value.toISOString();
}

function mapOrder(row: OrderRow): CommerceOrderRecord {
  return CommerceOrderRecordSchema.parse({
    ...row,
    createdAt: timestamp(row.createdAt),
    updatedAt: timestamp(row.updatedAt),
  });
}

function mapOrderItem(row: OrderItemRow): CommerceOrderItemRecord {
  return CommerceOrderItemRecordSchema.parse({
    ...row,
    createdAt: timestamp(row.createdAt),
  });
}

function mapPayment(row: PaymentRow): CommercePaymentRecord {
  return CommercePaymentRecordSchema.parse({
    ...row,
    amount: row.amount.toFixed(2),
    observedAt: timestamp(row.observedAt),
  });
}

function mapWarehouse(row: WarehouseRow): CommerceWarehouseRecord {
  return CommerceWarehouseRecordSchema.parse({
    ...row,
    createdAt: timestamp(row.createdAt),
  });
}

function mapInventoryObservation(
  row: InventoryObservationRow,
): CommerceInventoryObservationRecord {
  return CommerceInventoryObservationRecordSchema.parse({
    ...row,
    observedAt: timestamp(row.observedAt),
  });
}

function mapFulfilment(row: FulfilmentRow): CommerceFulfilmentRecord {
  return CommerceFulfilmentRecordSchema.parse({
    ...row,
    createdAt: timestamp(row.createdAt),
    updatedAt: timestamp(row.updatedAt),
    observedAt: timestamp(row.observedAt),
  });
}

function mapFulfilmentEvent(
  row: FulfilmentEventRow,
): CommerceFulfilmentEventRecord {
  return CommerceFulfilmentEventRecordSchema.parse({
    ...row,
    occurredAt: timestamp(row.occurredAt),
  });
}

function mapShipment(row: ShipmentRow): CommerceShipmentRecord {
  return CommerceShipmentRecordSchema.parse({
    ...row,
    createdAt: timestamp(row.createdAt),
    observedAt: timestamp(row.observedAt),
  });
}

export interface CommerceReadRepository {
  findOrderById(orderId: string): Promise<CommerceOrderRecord | null>;
  listOrderItemsForOrder(orderId: string): Promise<CommerceOrderItemRecord[]>;
  findCurrentPaymentForOrder(
    orderId: string,
  ): Promise<CommercePaymentRecord | null>;
  findCurrentFulfilmentForOrder(
    orderId: string,
  ): Promise<CommerceFulfilmentRecord | null>;
  listFulfilmentEventsForOrder(
    orderId: string,
  ): Promise<CommerceFulfilmentEventRecord[]>;
  findCurrentShipmentForOrder(
    orderId: string,
  ): Promise<CommerceShipmentRecord | null>;
  listInventoryObservationsForSkus(
    skus: readonly string[],
  ): Promise<CommerceInventoryObservationRecord[]>;
  listWarehousesByIds(
    warehouseIds: readonly string[],
  ): Promise<CommerceWarehouseRecord[]>;
}

export interface CommerceRepositoryContext {
  readonly commerce: CommerceReadRepository;
  disconnect(): Promise<void>;
}

class PrismaCommerceReadRepository implements CommerceReadRepository {
  constructor(private readonly database: PrismaClient) {}

  async findOrderById(orderId: string): Promise<CommerceOrderRecord | null> {
    const id = IdentifierSchema.parse(orderId);
    const row = await this.database.order.findUnique({
      where: { id },
      select: orderSelection,
    });

    return row ? mapOrder(row) : null;
  }

  async listOrderItemsForOrder(
    orderId: string,
  ): Promise<CommerceOrderItemRecord[]> {
    const id = IdentifierSchema.parse(orderId);
    const rows = await this.database.orderItem.findMany({
      where: { orderId: id },
      orderBy: [{ sku: "asc" }, { id: "asc" }],
      select: orderItemSelection,
    });

    return rows.map(mapOrderItem);
  }

  async findCurrentPaymentForOrder(
    orderId: string,
  ): Promise<CommercePaymentRecord | null> {
    const id = IdentifierSchema.parse(orderId);
    const row = await this.database.payment.findUnique({
      where: { orderId: id },
      select: paymentSelection,
    });

    return row ? mapPayment(row) : null;
  }

  async findCurrentFulfilmentForOrder(
    orderId: string,
  ): Promise<CommerceFulfilmentRecord | null> {
    const id = IdentifierSchema.parse(orderId);
    const row = await this.database.fulfilment.findUnique({
      where: { orderId: id },
      select: fulfilmentSelection,
    });

    return row ? mapFulfilment(row) : null;
  }

  async listFulfilmentEventsForOrder(
    orderId: string,
  ): Promise<CommerceFulfilmentEventRecord[]> {
    const id = IdentifierSchema.parse(orderId);
    const rows = await this.database.fulfilmentEvent.findMany({
      where: { orderId: id },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
      select: fulfilmentEventSelection,
    });

    return rows.map(mapFulfilmentEvent);
  }

  async findCurrentShipmentForOrder(
    orderId: string,
  ): Promise<CommerceShipmentRecord | null> {
    const id = IdentifierSchema.parse(orderId);
    const row = await this.database.shipment.findUnique({
      where: { orderId: id },
      select: shipmentSelection,
    });

    return row ? mapShipment(row) : null;
  }

  async listInventoryObservationsForSkus(
    skus: readonly string[],
  ): Promise<CommerceInventoryObservationRecord[]> {
    const requestedSkus = IdentifierListSchema.parse([...skus]);
    if (requestedSkus.length === 0) {
      return [];
    }

    const rows = await this.database.inventoryObservation.findMany({
      where: { sku: { in: requestedSkus } },
      orderBy: [
        { warehouseId: "asc" },
        { sku: "asc" },
        { sourceSystem: "asc" },
      ],
      select: inventoryObservationSelection,
    });

    return rows.map(mapInventoryObservation);
  }

  async listWarehousesByIds(
    warehouseIds: readonly string[],
  ): Promise<CommerceWarehouseRecord[]> {
    const requestedIds = IdentifierListSchema.parse([...warehouseIds]);
    if (requestedIds.length === 0) {
      return [];
    }

    const rows = await this.database.warehouse.findMany({
      where: { id: { in: requestedIds } },
      orderBy: { id: "asc" },
      select: warehouseSelection,
    });

    return rows.map(mapWarehouse);
  }
}

export function createWorkflowRepositoryContext(): CommerceRepositoryContext {
  const database = createWorkflowDatabaseClient();

  return {
    commerce: new PrismaCommerceReadRepository(database),
    disconnect: () => database.$disconnect(),
  };
}
