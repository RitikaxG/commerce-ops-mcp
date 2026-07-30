import { describe, expect, test } from "bun:test";
import {
  ApprovedScenarioSchema,
  InventoryObservationFixtureSchema,
  OrderFixtureSchema,
  OrderItemFixtureSchema,
} from "@repo/schemas";

import { commerceFixtures } from "../commerce.js";
import { approvedScenarioManifest } from "../manifest.js";
import {
  FixtureValidationError,
  validateApprovedDemoData,
  validateFixtureRelationships,
  validateFixtureShapes,
} from "../validation.js";

describe("fixture shape validation", () => {
  test("accepts every approved fixture and relationship", () => {
    expect(() =>
      validateApprovedDemoData(commerceFixtures, approvedScenarioManifest),
    ).not.toThrow();
  });

  test("rejects malformed status values", () => {
    expect(() =>
      OrderFixtureSchema.parse({
        ...commerceFixtures.orders[0],
        status: "SHIPPED",
      }),
    ).toThrow();
  });

  test("rejects empty identifiers", () => {
    expect(() =>
      OrderFixtureSchema.parse({
        ...commerceFixtures.orders[0],
        id: " ",
      }),
    ).toThrow();
  });

  test("rejects negative inventory", () => {
    expect(() =>
      InventoryObservationFixtureSchema.parse({
        ...commerceFixtures.inventoryObservations[0],
        availableQuantity: -1,
      }),
    ).toThrow();
  });

  test("rejects invalid inventory source systems", () => {
    expect(() =>
      InventoryObservationFixtureSchema.parse({
        ...commerceFixtures.inventoryObservations[0],
        sourceSystem: "ERP_SYSTEM",
      }),
    ).toThrow();
  });

  test("rejects zero or negative order-item quantities", () => {
    expect(() =>
      OrderItemFixtureSchema.parse({
        ...commerceFixtures.orderItems[0],
        quantity: 0,
      }),
    ).toThrow();
  });

  test("rejects invalid timestamps", () => {
    expect(() =>
      OrderFixtureSchema.parse({
        ...commerceFixtures.orders[0],
        createdAt: "not-a-timestamp",
      }),
    ).toThrow();
  });

  test("rejects duplicate fixture primary keys", () => {
    const duplicate = structuredClone(commerceFixtures);
    duplicate.payments.push(structuredClone(duplicate.payments[0]!));

    expect(() =>
      validateFixtureShapes(duplicate, approvedScenarioManifest),
    ).toThrow(FixtureValidationError);
  });

  test("rejects invalid expected scenario values", () => {
    expect(() =>
      ApprovedScenarioSchema.parse({
        ...approvedScenarioManifest[0],
        shouldEscalate: false,
        expectedQueue: "FULFILMENT_OPERATIONS",
      }),
    ).toThrow();
  });
});

describe("fixture relationship validation", () => {
  test("rejects an invalid order reference", () => {
    const invalid = structuredClone(commerceFixtures);
    invalid.payments[0]!.orderId = "ORD-UNKNOWN";

    expect(() =>
      validateFixtureRelationships(invalid, approvedScenarioManifest),
    ).toThrow("references unknown order");
  });

  test("rejects an invalid warehouse reference", () => {
    const invalid = structuredClone(commerceFixtures);
    invalid.fulfilments[0]!.assignedWarehouseId = "WH-UNKNOWN";

    expect(() =>
      validateFixtureRelationships(invalid, approvedScenarioManifest),
    ).toThrow("references unknown warehouse");
  });

  test("rejects a shipment and fulfilment order mismatch", () => {
    const invalid = structuredClone(commerceFixtures);
    invalid.shipments[0]!.orderId = "ORD-1048";

    expect(() =>
      validateFixtureRelationships(invalid, approvedScenarioManifest),
    ).toThrow("belong to different orders");
  });

  test("rejects unsupported events without a fulfilment ID", () => {
    const invalid = structuredClone(commerceFixtures);
    invalid.fulfilmentEvents[0]!.fulfilmentId = null;

    expect(() =>
      validateFixtureRelationships(invalid, approvedScenarioManifest),
    ).toThrow("may omit fulfilmentId only for a creation failure");
  });

  test("rejects an undeclared seeded order", () => {
    const invalid = structuredClone(commerceFixtures);
    invalid.orders.push({
      ...invalid.orders[0]!,
      id: "ORD-UNDECLARED",
    });

    expect(() =>
      validateFixtureRelationships(invalid, approvedScenarioManifest),
    ).toThrow("undeclared demo order");
  });
});
