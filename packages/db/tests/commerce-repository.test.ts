import { expect, test } from "bun:test";
import * as databasePackage from "@repo/db";
import {
  CommerceFulfilmentEventRecordSchema,
  CommerceFulfilmentRecordSchema,
  CommerceInventoryObservationRecordSchema,
  CommerceOrderItemRecordSchema,
  CommerceOrderRecordSchema,
  CommercePaymentRecordSchema,
  CommerceShipmentRecordSchema,
  CommerceWarehouseRecordSchema,
} from "@repo/schemas";

import {
  connectDatabase,
  databaseAccessEnvironment,
} from "./database-test-helpers.js";

const commerceTables = [
  "orders",
  "order_items",
  "payments",
  "warehouses",
  "inventory_levels",
  "fulfilments",
  "fulfilment_events",
  "shipments",
] as const;

async function commerceFingerprint(): Promise<string> {
  const database = await connectDatabase(
    databaseAccessEnvironment.workflowDatabaseUrl,
  );

  try {
    const fingerprints: string[] = [];

    for (const table of commerceTables) {
      const result = await database.query<{
        rowCount: string;
        fingerprint: string;
      }>(
        `SELECT
          count(*)::text AS "rowCount",
          md5(
            COALESCE(
              string_agg(
                row_to_json(record)::text,
                '|' ORDER BY row_to_json(record)::text
              ),
              ''
            )
          ) AS fingerprint
        FROM "commerce"."${table}" AS record`,
      );
      const row = result.rows[0];
      fingerprints.push(
        `${table}:${row?.rowCount ?? "missing"}:${row?.fingerprint ?? "missing"}`,
      );
    }

    return fingerprints.join("|");
  } finally {
    await database.end();
  }
}

test("restricted commerce repositories preserve source records and missing evidence", async () => {
  const before = await commerceFingerprint();
  const context = databasePackage.createWorkflowRepositoryContext();

  try {
    expect(
      Object.keys(databasePackage).some((name) => /prisma/i.test(name)),
    ).toBeFalse();

    expect(
      Object.getOwnPropertyNames(Object.getPrototypeOf(context.commerce))
        .filter((name) => name !== "constructor")
        .sort(),
    ).toEqual(
      [
        "findCurrentFulfilmentForOrder",
        "findCurrentPaymentForOrder",
        "findCurrentShipmentForOrder",
        "findOrderById",
        "listFulfilmentEventsForOrder",
        "listInventoryObservationsForSkus",
        "listOrderItemsForOrder",
        "listWarehousesByIds",
      ].sort(),
    );

    const order1042 = await context.commerce.findOrderById("ORD-1042");
    expect(order1042).not.toBeNull();
    if (!order1042) {
      throw new Error("Expected ORD-1042");
    }
    expect(CommerceOrderRecordSchema.parse(order1042)).toEqual(order1042);

    const items1042 = await context.commerce.listOrderItemsForOrder("ORD-1042");
    expect(items1042.map((item) => item.sku)).toEqual(["SKU-1042"]);
    expect(
      items1042.map((item) => CommerceOrderItemRecordSchema.parse(item)),
    ).toEqual(items1042);

    const payment1042 =
      await context.commerce.findCurrentPaymentForOrder("ORD-1042");
    expect(payment1042).not.toBeNull();
    if (!payment1042) {
      throw new Error("Expected payment for ORD-1042");
    }
    expect(CommercePaymentRecordSchema.parse(payment1042)).toEqual(payment1042);
    expect(payment1042.amount).toBe("49.99");

    const fulfilment1042 =
      await context.commerce.findCurrentFulfilmentForOrder("ORD-1042");
    expect(fulfilment1042).not.toBeNull();
    if (!fulfilment1042) {
      throw new Error("Expected fulfilment for ORD-1042");
    }
    expect(CommerceFulfilmentRecordSchema.parse(fulfilment1042)).toEqual(
      fulfilment1042,
    );
    expect(fulfilment1042.assignedWarehouseId).toBe("WH-A");

    const events1042 =
      await context.commerce.listFulfilmentEventsForOrder("ORD-1042");
    expect(events1042.map((event) => event.type)).toEqual([
      "FULFILMENT_CREATED",
      "INVENTORY_HOLD_ADDED",
    ]);
    expect(
      events1042.map((event) =>
        CommerceFulfilmentEventRecordSchema.parse(event),
      ),
    ).toEqual(events1042);
    expect(
      await context.commerce.findCurrentShipmentForOrder("ORD-1042"),
    ).toBeNull();

    const inventory1042 =
      await context.commerce.listInventoryObservationsForSkus(["SKU-1042"]);
    expect(
      inventory1042.map(({ warehouseId, availableQuantity, sourceSystem }) => ({
        warehouseId,
        availableQuantity,
        sourceSystem,
      })),
    ).toEqual([
      {
        warehouseId: "WH-A",
        availableQuantity: 0,
        sourceSystem: "WAREHOUSE_SYSTEM",
      },
      {
        warehouseId: "WH-B",
        availableQuantity: 3,
        sourceSystem: "WAREHOUSE_SYSTEM",
      },
    ]);
    expect(
      inventory1042.map((observation) =>
        CommerceInventoryObservationRecordSchema.parse(observation),
      ),
    ).toEqual(inventory1042);

    const warehouses = await context.commerce.listWarehousesByIds([
      "WH-B",
      "WH-A",
    ]);
    expect(warehouses.map((warehouse) => warehouse.id)).toEqual([
      "WH-A",
      "WH-B",
    ]);
    expect(
      warehouses.map((warehouse) =>
        CommerceWarehouseRecordSchema.parse(warehouse),
      ),
    ).toEqual(warehouses);

    expect(await context.commerce.findOrderById("ORD-UNKNOWN")).toBeNull();
    expect(
      await context.commerce.findCurrentPaymentForOrder("ORD-UNKNOWN"),
    ).toBeNull();
    expect(
      await context.commerce.findCurrentFulfilmentForOrder("ORD-1043"),
    ).toBeNull();
    expect(
      await context.commerce.findCurrentShipmentForOrder("ORD-UNKNOWN"),
    ).toBeNull();
    expect(
      await context.commerce.listOrderItemsForOrder("ORD-UNKNOWN"),
    ).toEqual([]);
    expect(
      await context.commerce.listFulfilmentEventsForOrder("ORD-UNKNOWN"),
    ).toEqual([]);
    expect(
      await context.commerce.listInventoryObservationsForSkus(["SKU-UNKNOWN"]),
    ).toEqual([]);
    expect(await context.commerce.listWarehousesByIds(["WH-UNKNOWN"])).toEqual(
      [],
    );

    const events1043 =
      await context.commerce.listFulfilmentEventsForOrder("ORD-1043");
    expect(events1043.map((event) => event.type)).toEqual([
      "FULFILMENT_CREATION_FAILED",
    ]);

    const events1044 =
      await context.commerce.listFulfilmentEventsForOrder("ORD-1044");
    expect(events1044.map((event) => event.id)).toEqual([
      "EVENT-1044-CREATED",
      "EVENT-1044-PROCESSING",
    ]);

    expect(
      await context.commerce.listInventoryObservationsForSkus(["SKU-1046"]),
    ).toEqual([]);

    const shipment1047 =
      await context.commerce.findCurrentShipmentForOrder("ORD-1047");
    expect(shipment1047).not.toBeNull();
    if (!shipment1047) {
      throw new Error("Expected shipment for ORD-1047");
    }
    expect(CommerceShipmentRecordSchema.parse(shipment1047)).toEqual(
      shipment1047,
    );
    expect(shipment1047.id).toBe("SHIP-1047");

    const payment1049 =
      await context.commerce.findCurrentPaymentForOrder("ORD-1049");
    expect(payment1049?.status).toBe("PROCESSING");

    const inventory1050 =
      await context.commerce.listInventoryObservationsForSkus(["SKU-1050"]);
    expect(
      inventory1050.map(({ sourceSystem, availableQuantity }) => ({
        sourceSystem,
        availableQuantity,
      })),
    ).toEqual([
      { sourceSystem: "WAREHOUSE_SYSTEM", availableQuantity: 0 },
      { sourceSystem: "COMMERCE_SYSTEM", availableQuantity: 4 },
    ]);

    await Promise.all([
      context.commerce.findOrderById("ORD-1042"),
      context.commerce.listOrderItemsForOrder("ORD-1042"),
      context.commerce.findCurrentPaymentForOrder("ORD-1042"),
      context.commerce.findCurrentFulfilmentForOrder("ORD-1042"),
      context.commerce.listFulfilmentEventsForOrder("ORD-1042"),
      context.commerce.findCurrentShipmentForOrder("ORD-1042"),
      context.commerce.listInventoryObservationsForSkus([
        "SKU-1042",
        "SKU-1046",
        "SKU-1050",
      ]),
      context.commerce.listWarehousesByIds(["WH-A", "WH-B"]),
    ]);
  } finally {
    await context.disconnect();
  }

  expect(await commerceFingerprint()).toBe(before);
}, 90_000);
