import { describe, expect, test } from "bun:test";

import { commerceFixtures } from "../commerce.js";
import {
  DEMO_REFERENCE_TIME,
  isInsideExpectedProcessingWindow,
} from "../reference-time.js";

const itemFor = (orderId: string) =>
  commerceFixtures.orderItems.find((item) => item.orderId === orderId)!;
const fulfilmentFor = (orderId: string) =>
  commerceFixtures.fulfilments.find(
    (fulfilment) => fulfilment.orderId === orderId,
  );
const eventsFor = (orderId: string) =>
  commerceFixtures.fulfilmentEvents.filter(
    (event) => event.orderId === orderId,
  );
const inventoryFor = (orderId: string, warehouseId = "WH-A") => {
  const { sku } = itemFor(orderId);
  return commerceFixtures.inventoryObservations.filter(
    (observation) =>
      observation.warehouseId === warehouseId && observation.sku === sku,
  );
};

describe("approved commerce evidence", () => {
  test("ORD-1042 has zero assigned stock and an eligible alternative", () => {
    expect(inventoryFor("ORD-1042", "WH-A")[0]?.availableQuantity).toBe(0);
    expect(
      inventoryFor("ORD-1042", "WH-B")[0]?.availableQuantity,
    ).toBeGreaterThanOrEqual(3);
  });

  test("ORD-1043 has no fulfilment and a confirmed creation failure", () => {
    expect(fulfilmentFor("ORD-1043")).toBeUndefined();
    expect(eventsFor("ORD-1043")).toContainEqual(
      expect.objectContaining({
        fulfilmentId: null,
        type: "FULFILMENT_CREATION_FAILED",
        status: "FAILED",
      }),
    );
  });

  test("ORD-1044 uses a fixed clock inside the processing window", () => {
    const processingStarted = eventsFor("ORD-1044").find(
      ({ type }) => type === "PROCESSING_STARTED",
    );
    expect(processingStarted).toBeDefined();
    expect(
      isInsideExpectedProcessingWindow(
        processingStarted!.occurredAt,
        DEMO_REFERENCE_TIME,
      ),
    ).toBeTrue();
  });

  test("ORD-1045 has a label-creation failure and no shipment", () => {
    expect(eventsFor("ORD-1045")).toContainEqual(
      expect.objectContaining({
        type: "SHIPMENT_LABEL_CREATION_FAILED",
        status: "FAILED",
      }),
    );
    expect(
      commerceFixtures.shipments.some(({ orderId }) => orderId === "ORD-1045"),
    ).toBeFalse();
  });

  test("ORD-1046 represents missing inventory as absence, not zero", () => {
    expect(fulfilmentFor("ORD-1046")?.assignedWarehouseId).toBe("WH-A");
    expect(inventoryFor("ORD-1046", "WH-A")).toHaveLength(0);
  });

  test("ORD-1047 has a persisted shipment", () => {
    expect(commerceFixtures.shipments).toContainEqual(
      expect.objectContaining({
        orderId: "ORD-1047",
        status: "CREATED",
      }),
    );
  });

  test("ORD-1048 is outside the window with no recognised failure", () => {
    const processingStarted = eventsFor("ORD-1048").find(
      ({ type }) => type === "PROCESSING_STARTED",
    );
    expect(
      isInsideExpectedProcessingWindow(
        processingStarted!.occurredAt,
        DEMO_REFERENCE_TIME,
      ),
    ).toBeFalse();
    expect(
      eventsFor("ORD-1048").some(({ status }) => status === "FAILED"),
    ).toBeFalse();
    expect(fulfilmentFor("ORD-1048")?.holdReason).toBeNull();
  });

  test("ORD-1049 persists PROCESSING as authoritative payment state", () => {
    expect(
      commerceFixtures.payments.find(({ orderId }) => orderId === "ORD-1049")
        ?.status,
    ).toBe("PROCESSING");
  });

  test("ORD-1050 persists conflicting observations from two sources", () => {
    expect(inventoryFor("ORD-1050")).toEqual([
      expect.objectContaining({
        sourceSystem: "WAREHOUSE_SYSTEM",
        availableQuantity: 0,
      }),
      expect.objectContaining({
        sourceSystem: "COMMERCE_SYSTEM",
        availableQuantity: 4,
      }),
    ]);
  });
});
