import { describe, expect, test } from "bun:test";
import type { CommerceReadRepository } from "@repo/db";
import {
  EVIDENCE_SOURCE_NAMES,
  NormalizedOrderEvidenceSchema,
  type CommerceFulfilmentEventRecord,
  type CommerceFulfilmentRecord,
  type CommerceInventoryObservationRecord,
  type CommerceOrderItemRecord,
  type CommerceOrderRecord,
  type CommercePaymentRecord,
  type CommerceShipmentRecord,
  type CommerceWarehouseRecord,
} from "@repo/schemas";

import { createEvidenceCollector, type EvidenceClock } from "../index.js";

const FIXED_TIME = "2026-07-30T13:00:00.000Z";

const fixedClock: EvidenceClock = {
  now: () => new Date(FIXED_TIME),
};

class FakeCommerceRepository implements CommerceReadRepository {
  readonly inventoryRequests: string[][] = [];
  readonly warehouseRequests: string[][] = [];

  constructor(
    private readonly overrides: Partial<CommerceReadRepository> = {},
  ) {}

  findOrderById(orderId: string): Promise<CommerceOrderRecord | null> {
    return this.overrides.findOrderById?.(orderId) ?? Promise.resolve(null);
  }

  listOrderItemsForOrder(orderId: string): Promise<CommerceOrderItemRecord[]> {
    return (
      this.overrides.listOrderItemsForOrder?.(orderId) ?? Promise.resolve([])
    );
  }

  findCurrentPaymentForOrder(
    orderId: string,
  ): Promise<CommercePaymentRecord | null> {
    return (
      this.overrides.findCurrentPaymentForOrder?.(orderId) ??
      Promise.resolve(null)
    );
  }

  findCurrentFulfilmentForOrder(
    orderId: string,
  ): Promise<CommerceFulfilmentRecord | null> {
    return (
      this.overrides.findCurrentFulfilmentForOrder?.(orderId) ??
      Promise.resolve(null)
    );
  }

  listFulfilmentEventsForOrder(
    orderId: string,
  ): Promise<CommerceFulfilmentEventRecord[]> {
    return (
      this.overrides.listFulfilmentEventsForOrder?.(orderId) ??
      Promise.resolve([])
    );
  }

  findCurrentShipmentForOrder(
    orderId: string,
  ): Promise<CommerceShipmentRecord | null> {
    return (
      this.overrides.findCurrentShipmentForOrder?.(orderId) ??
      Promise.resolve(null)
    );
  }

  listInventoryObservationsForSkus(
    skus: readonly string[],
  ): Promise<CommerceInventoryObservationRecord[]> {
    this.inventoryRequests.push([...skus]);
    return (
      this.overrides.listInventoryObservationsForSkus?.(skus) ??
      Promise.resolve([])
    );
  }

  listWarehousesByIds(
    warehouseIds: readonly string[],
  ): Promise<CommerceWarehouseRecord[]> {
    this.warehouseRequests.push([...warehouseIds]);
    return (
      this.overrides.listWarehousesByIds?.(warehouseIds) ?? Promise.resolve([])
    );
  }
}

const order: CommerceOrderRecord = {
  id: "ORD-TEST",
  status: "CONFIRMED",
  createdAt: "2026-07-28T09:00:00.000Z",
  updatedAt: "2026-07-30T12:00:00.000Z",
};

const payment: CommercePaymentRecord = {
  id: "PAY-TEST",
  orderId: order.id,
  status: "SUCCEEDED",
  amount: "49.99",
  currency: "USD",
  providerReference: "PAYMENT-SOURCE-TEST",
  observedAt: "2026-07-30T11:00:00.000Z",
};

const fulfilment: CommerceFulfilmentRecord = {
  id: "FUL-TEST",
  orderId: order.id,
  status: "ON_HOLD",
  holdReason: "INVENTORY_OUT_OF_STOCK",
  assignedWarehouseId: "WH-B",
  providerReference: "FULFILMENT-SOURCE-TEST",
  createdAt: "2026-07-30T08:00:00.000Z",
  updatedAt: "2026-07-30T09:00:00.000Z",
  observedAt: "2026-07-30T12:00:00.000Z",
};

describe("evidence collector", () => {
  test("normalizes all successful records with deterministic ordering and timestamps", async () => {
    const items: CommerceOrderItemRecord[] = [
      {
        id: "ITEM-2",
        orderId: order.id,
        sku: "SKU-B",
        quantity: 1,
        createdAt: "2026-07-30T10:00:00.000Z",
      },
      {
        id: "ITEM-1",
        orderId: order.id,
        sku: "SKU-A",
        quantity: 1,
        createdAt: "2026-07-30T09:00:00.000Z",
      },
      {
        id: "ITEM-3",
        orderId: order.id,
        sku: "SKU-A",
        quantity: 2,
        createdAt: "2026-07-30T11:00:00.000Z",
      },
    ];
    const events: CommerceFulfilmentEventRecord[] = [
      {
        id: "EVENT-2",
        orderId: order.id,
        fulfilmentId: fulfilment.id,
        sourceEventReference: "SOURCE-EVENT-2",
        type: "INVENTORY_HOLD_ADDED",
        status: "SUCCEEDED",
        details: {},
        occurredAt: "2026-07-30T10:00:00.000Z",
      },
      {
        id: "EVENT-1",
        orderId: order.id,
        fulfilmentId: fulfilment.id,
        sourceEventReference: "SOURCE-EVENT-1",
        type: "FULFILMENT_CREATED",
        status: "SUCCEEDED",
        details: {},
        occurredAt: "2026-07-30T08:00:00.000Z",
      },
    ];
    const inventory: CommerceInventoryObservationRecord[] = [
      {
        warehouseId: "WH-B",
        sku: "SKU-B",
        sourceSystem: "COMMERCE_SYSTEM",
        availableQuantity: 3,
        observedAt: "2026-07-30T10:00:00.000Z",
      },
      {
        warehouseId: "WH-A",
        sku: "SKU-A",
        sourceSystem: "WAREHOUSE_SYSTEM",
        availableQuantity: 0,
        observedAt: "2026-07-30T12:00:00.000Z",
      },
    ];
    const warehouses: CommerceWarehouseRecord[] = [
      {
        id: "WH-B",
        name: "Warehouse B",
        active: true,
        createdAt: "2026-07-29T08:00:00.000Z",
      },
      {
        id: "WH-A",
        name: "Warehouse A",
        active: false,
        createdAt: "2026-07-28T08:00:00.000Z",
      },
    ];
    const repository = new FakeCommerceRepository({
      findOrderById: async () => order,
      listOrderItemsForOrder: async () => items,
      findCurrentPaymentForOrder: async () => payment,
      findCurrentFulfilmentForOrder: async () => fulfilment,
      listFulfilmentEventsForOrder: async () => events,
      findCurrentShipmentForOrder: async () => null,
      listInventoryObservationsForSkus: async () => inventory,
      listWarehousesByIds: async () => warehouses,
    });

    const snapshot = await createEvidenceCollector({
      commerce: repository,
      clock: fixedClock,
    }).collect(order.id);

    expect(NormalizedOrderEvidenceSchema.parse(snapshot)).toEqual(snapshot);
    expect(snapshot.collectedAt).toBe(FIXED_TIME);
    expect(snapshot.sourceReads.map(({ source }) => source)).toEqual([
      ...EVIDENCE_SOURCE_NAMES,
    ]);
    expect(
      snapshot.sourceReads.every(({ readAt }) => readAt === FIXED_TIME),
    ).toBeTrue();
    expect(snapshot.orderItems.map(({ id }) => id)).toEqual([
      "ITEM-1",
      "ITEM-3",
      "ITEM-2",
    ]);
    expect(snapshot.fulfilmentEvents.map(({ id }) => id)).toEqual([
      "EVENT-1",
      "EVENT-2",
    ]);
    expect(
      snapshot.inventoryObservations.map(
        ({ warehouseId, sku, sourceSystem }) =>
          `${warehouseId}/${sku}/${sourceSystem}`,
      ),
    ).toEqual(["WH-A/SKU-A/WAREHOUSE_SYSTEM", "WH-B/SKU-B/COMMERCE_SYSTEM"]);
    expect(snapshot.warehouses.map(({ id }) => id)).toEqual(["WH-A", "WH-B"]);
    expect(snapshot.warehouses[0]?.active).toBeFalse();
    expect(repository.inventoryRequests).toEqual([["SKU-A", "SKU-B"]]);
    expect(repository.warehouseRequests).toEqual([["WH-A", "WH-B"]]);
    expect(snapshot.sourceReads[1].latestSourceTimestamp).toBe(
      "2026-07-30T11:00:00.000Z",
    );
    expect(snapshot.sourceReads[6].latestSourceTimestamp).toBe(
      "2026-07-30T12:00:00.000Z",
    );
    expect(snapshot.sourceReads[7].latestSourceTimestamp).toBe(
      "2026-07-29T08:00:00.000Z",
    );
  });

  test("preserves successful absence and safely isolates an independent source failure", async () => {
    const repository = new FakeCommerceRepository({
      findCurrentPaymentForOrder: async () => {
        throw new Error(
          "postgresql://workflow:secret@database/internal SQL SELECT",
        );
      },
    });

    const snapshot = await createEvidenceCollector({
      commerce: repository,
      clock: fixedClock,
    }).collect("ORD-ABSENT");

    expect(snapshot.order).toBeNull();
    expect(snapshot.orderItems).toEqual([]);
    expect(snapshot.fulfilment).toBeNull();
    expect(snapshot.inventoryObservations).toEqual([]);
    expect(snapshot.warehouses).toEqual([]);
    expect(repository.inventoryRequests).toEqual([[]]);
    expect(repository.warehouseRequests).toEqual([[]]);
    expect(snapshot.sourceReads[0]).toMatchObject({
      source: "ORDER",
      status: "SUCCEEDED",
      recordCount: 0,
      errorCode: null,
    });
    expect(snapshot.sourceReads[2]).toEqual({
      source: "PAYMENT",
      status: "FAILED",
      readAt: FIXED_TIME,
      latestSourceTimestamp: null,
      recordCount: 0,
      errorCode: "SOURCE_READ_FAILED",
    });
    expect(snapshot.sourceReads[3].status).toBe("SUCCEEDED");
    expect(snapshot.sourceReads[6].status).toBe("SUCCEEDED");
    expect(JSON.stringify(snapshot)).not.toContain("secret");
    expect(JSON.stringify(snapshot)).not.toContain("SELECT");
  });

  test("skips dependent inventory and warehouses when order items are unavailable", async () => {
    const repository = new FakeCommerceRepository({
      listOrderItemsForOrder: async () => {
        throw new Error("source unavailable");
      },
      findCurrentFulfilmentForOrder: async () => fulfilment,
    });

    const snapshot = await createEvidenceCollector({
      commerce: repository,
      clock: fixedClock,
    }).collect(order.id);

    expect(snapshot.orderItems).toEqual([]);
    expect(snapshot.inventoryObservations).toEqual([]);
    expect(snapshot.warehouses).toEqual([]);
    expect(repository.inventoryRequests).toEqual([]);
    expect(repository.warehouseRequests).toEqual([]);
    expect(snapshot.sourceReads[1]).toMatchObject({
      source: "ORDER_ITEMS",
      status: "FAILED",
      errorCode: "SOURCE_READ_FAILED",
    });
    expect(snapshot.sourceReads[6]).toMatchObject({
      source: "INVENTORY",
      status: "SKIPPED",
      errorCode: "ORDER_ITEMS_UNAVAILABLE",
    });
    expect(snapshot.sourceReads[7]).toMatchObject({
      source: "WAREHOUSES",
      status: "SKIPPED",
      errorCode: "WAREHOUSE_IDS_UNAVAILABLE",
    });
    expect(snapshot.sourceReads[4].status).toBe("SUCCEEDED");
    expect(snapshot.sourceReads[5].status).toBe("SUCCEEDED");
  });
});
