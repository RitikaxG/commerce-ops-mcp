import { describe, expect, test } from "bun:test";
import {
  EVIDENCE_SOURCE_NAMES,
  EvidenceReadinessResultSchema,
  NormalizedOrderEvidenceSchema,
  type CommerceFulfilmentEventRecord,
  type CommerceFulfilmentRecord,
  type CommerceInventoryObservationRecord,
  type CommerceOrderItemRecord,
  type CommercePaymentRecord,
  type CommerceShipmentRecord,
  type CommerceWarehouseRecord,
  type EvidenceSourceName,
  type NormalizedOrderEvidence,
} from "@repo/schemas";

import { createEvidenceReadinessEvaluator } from "../index.js";

const FIXED_TIME = "2026-07-30T13:00:00.000Z";
const ORDER_ID = "ORD-TEST";

const baseItem: CommerceOrderItemRecord = {
  id: "ITEM-TEST",
  orderId: ORDER_ID,
  sku: "SKU-TEST",
  quantity: 1,
  createdAt: "2026-07-28T09:00:00.000Z",
};

const basePayment: CommercePaymentRecord = {
  id: "PAY-TEST",
  orderId: ORDER_ID,
  status: "SUCCEEDED",
  amount: "49.99",
  currency: "USD",
  providerReference: "PAYMENT-SOURCE-TEST",
  observedAt: "2026-07-30T12:00:00.000Z",
};

const baseFulfilment: CommerceFulfilmentRecord = {
  id: "FUL-TEST",
  orderId: ORDER_ID,
  status: "PROCESSING",
  holdReason: null,
  assignedWarehouseId: "WH-A",
  providerReference: "FULFILMENT-SOURCE-TEST",
  createdAt: "2026-07-30T08:00:00.000Z",
  updatedAt: "2026-07-30T09:00:00.000Z",
  observedAt: "2026-07-30T12:00:00.000Z",
};

const warehouseA: CommerceWarehouseRecord = {
  id: "WH-A",
  name: "Warehouse A",
  active: true,
  createdAt: "2026-07-28T09:00:00.000Z",
};

const baseInventory: CommerceInventoryObservationRecord = {
  warehouseId: warehouseA.id,
  sku: baseItem.sku,
  sourceSystem: "WAREHOUSE_SYSTEM",
  availableQuantity: 0,
  observedAt: "2026-07-30T12:00:00.000Z",
};

interface SnapshotOverrides {
  payment?: CommercePaymentRecord | null;
  fulfilment?: CommerceFulfilmentRecord | null;
  fulfilmentEvents?: CommerceFulfilmentEventRecord[];
  shipment?: CommerceShipmentRecord | null;
  orderItems?: CommerceOrderItemRecord[];
  inventoryObservations?: CommerceInventoryObservationRecord[];
  warehouses?: CommerceWarehouseRecord[];
  unavailableSources?: Partial<
    Record<EvidenceSourceName, "FAILED" | "SKIPPED">
  >;
}

function buildSnapshot(
  overrides: SnapshotOverrides = {},
): NormalizedOrderEvidence {
  const values: Pick<
    NormalizedOrderEvidence,
    | "order"
    | "orderItems"
    | "payment"
    | "fulfilment"
    | "fulfilmentEvents"
    | "shipment"
    | "inventoryObservations"
    | "warehouses"
  > = {
    order: {
      id: ORDER_ID,
      status: "CONFIRMED" as const,
      createdAt: "2026-07-28T09:00:00.000Z",
      updatedAt: "2026-07-30T12:00:00.000Z",
    },
    orderItems: overrides.orderItems ?? [baseItem],
    payment: Object.hasOwn(overrides, "payment")
      ? (overrides.payment ?? null)
      : basePayment,
    fulfilment: Object.hasOwn(overrides, "fulfilment")
      ? (overrides.fulfilment ?? null)
      : baseFulfilment,
    fulfilmentEvents: overrides.fulfilmentEvents ?? [],
    shipment: overrides.shipment ?? null,
    inventoryObservations: overrides.inventoryObservations ?? [baseInventory],
    warehouses: overrides.warehouses ?? [warehouseA],
  };

  const unavailable = overrides.unavailableSources ?? {};
  if (unavailable.ORDER) {
    values.order = null;
  }
  if (unavailable.ORDER_ITEMS) {
    values.orderItems = [];
  }
  if (unavailable.PAYMENT) {
    values.payment = null;
  }
  if (unavailable.FULFILMENT) {
    values.fulfilment = null;
  }
  if (unavailable.FULFILMENT_EVENTS) {
    values.fulfilmentEvents = [];
  }
  if (unavailable.SHIPMENT) {
    values.shipment = null;
  }
  if (unavailable.INVENTORY) {
    values.inventoryObservations = [];
  }
  if (unavailable.WAREHOUSES) {
    values.warehouses = [];
  }

  const recordCounts = {
    ORDER: values.order === null ? 0 : 1,
    ORDER_ITEMS: values.orderItems.length,
    PAYMENT: values.payment === null ? 0 : 1,
    FULFILMENT: values.fulfilment === null ? 0 : 1,
    FULFILMENT_EVENTS: values.fulfilmentEvents.length,
    SHIPMENT: values.shipment === null ? 0 : 1,
    INVENTORY: values.inventoryObservations.length,
    WAREHOUSES: values.warehouses.length,
  } satisfies Record<EvidenceSourceName, number>;

  const sourceReads = EVIDENCE_SOURCE_NAMES.map((source) => {
    const status = unavailable[source] ?? "SUCCEEDED";
    return {
      source,
      status,
      readAt: FIXED_TIME,
      latestSourceTimestamp:
        status === "SUCCEEDED" && recordCounts[source] > 0 ? FIXED_TIME : null,
      recordCount: status === "SUCCEEDED" ? recordCounts[source] : 0,
      errorCode:
        status === "FAILED"
          ? ("SOURCE_READ_FAILED" as const)
          : status === "SKIPPED"
            ? source === "INVENTORY"
              ? ("ORDER_ITEMS_UNAVAILABLE" as const)
              : ("WAREHOUSE_IDS_UNAVAILABLE" as const)
            : null,
    };
  });

  return NormalizedOrderEvidenceSchema.parse({
    schemaVersion: 1,
    orderId: ORDER_ID,
    collectedAt: FIXED_TIME,
    ...values,
    sourceReads,
  });
}

const evaluator = createEvidenceReadinessEvaluator();

function failureEvent(
  type: "FULFILMENT_CREATION_FAILED" | "SHIPMENT_LABEL_CREATION_FAILED",
): CommerceFulfilmentEventRecord {
  return {
    id: `EVENT-${type}`,
    orderId: ORDER_ID,
    fulfilmentId:
      type === "FULFILMENT_CREATION_FAILED" ? null : baseFulfilment.id,
    sourceEventReference: `SOURCE-${type}`,
    type,
    status: "FAILED",
    details: {},
    occurredAt: "2026-07-30T10:00:00.000Z",
  };
}

describe("evidence readiness", () => {
  test("returns COMPLETE for coherent evidence and treats quantity zero as evidence", () => {
    const result = evaluator.evaluate(buildSnapshot());

    expect(result).toEqual({
      schemaVersion: 1,
      orderId: ORDER_ID,
      evidenceStatus: "COMPLETE",
      missingFields: [],
      conflicts: [],
    });
    expect(Object.keys(result).sort()).toEqual([
      "conflicts",
      "evidenceStatus",
      "missingFields",
      "orderId",
      "schemaVersion",
    ]);
  });

  test("uses canonical source and successful-absence missing paths", () => {
    const cases = [
      {
        snapshot: buildSnapshot({
          unavailableSources: { SHIPMENT: "FAILED" },
        }),
        expected: ["sources.SHIPMENT"],
      },
      {
        snapshot: buildSnapshot({ payment: null }),
        expected: ["payment"],
      },
      {
        snapshot: buildSnapshot({ fulfilment: null }),
        expected: ["fulfilment"],
      },
    ];

    for (const { snapshot, expected } of cases) {
      const result = evaluator.evaluate(snapshot);
      expect(result.evidenceStatus).toBe("MISSING");
      expect(result.missingFields).toEqual(expected);
      expect(result.conflicts).toEqual([]);
    }
  });

  test("does not require unrelated downstream evidence for an earlier decisive gate", () => {
    const shipment: CommerceShipmentRecord = {
      id: "SHIP-TEST",
      orderId: ORDER_ID,
      fulfilmentId: baseFulfilment.id,
      status: "CREATED",
      providerReference: "SHIPMENT-SOURCE-TEST",
      createdAt: "2026-07-30T11:00:00.000Z",
      observedAt: "2026-07-30T12:00:00.000Z",
    };
    const downstreamUnavailable = {
      FULFILMENT: "FAILED",
      INVENTORY: "FAILED",
      WAREHOUSES: "FAILED",
    } as const;
    const cases = [
      buildSnapshot({
        payment: { ...basePayment, status: "PROCESSING" },
        unavailableSources: {
          SHIPMENT: "FAILED",
          FULFILMENT_EVENTS: "FAILED",
          ...downstreamUnavailable,
        },
      }),
      buildSnapshot({
        shipment,
        unavailableSources: {
          FULFILMENT_EVENTS: "FAILED",
          ...downstreamUnavailable,
        },
      }),
      buildSnapshot({
        fulfilmentEvents: [failureEvent("FULFILMENT_CREATION_FAILED")],
        unavailableSources: downstreamUnavailable,
      }),
      buildSnapshot({
        fulfilmentEvents: [failureEvent("SHIPMENT_LABEL_CREATION_FAILED")],
        unavailableSources: downstreamUnavailable,
      }),
    ];

    for (const snapshot of cases) {
      expect(evaluator.evaluate(snapshot)).toMatchObject({
        evidenceStatus: "COMPLETE",
        missingFields: [],
        conflicts: [],
      });
    }
  });

  test("does not treat a successful failure-type event as decisive", () => {
    const result = evaluator.evaluate(
      buildSnapshot({
        fulfilmentEvents: [
          {
            ...failureEvent("FULFILMENT_CREATION_FAILED"),
            status: "SUCCEEDED",
          },
        ],
        unavailableSources: {
          FULFILMENT: "FAILED",
          INVENTORY: "FAILED",
          WAREHOUSES: "FAILED",
        },
      }),
    );

    expect(result).toMatchObject({
      evidenceStatus: "MISSING",
      missingFields: ["sources.FULFILMENT"],
      conflicts: [],
    });
  });

  test("returns the exact assigned-warehouse inventory path when an observation is absent", () => {
    const result = evaluator.evaluate(
      buildSnapshot({ inventoryObservations: [] }),
    );

    expect(result).toEqual({
      schemaVersion: 1,
      orderId: ORDER_ID,
      evidenceStatus: "MISSING",
      missingFields: ["inventory.assignedWarehouse.WH-A.SKU-TEST"],
      conflicts: [],
    });
  });

  test("reports unequal source quantities without selecting a winner", () => {
    const result = evaluator.evaluate(
      buildSnapshot({
        inventoryObservations: [
          {
            ...baseInventory,
            sourceSystem: "COMMERCE_SYSTEM",
            availableQuantity: 4,
          },
          baseInventory,
        ],
      }),
    );

    expect(result).toEqual({
      schemaVersion: 1,
      orderId: ORDER_ID,
      evidenceStatus: "CONFLICTING",
      missingFields: [],
      conflicts: [
        {
          code: "INVENTORY_QUANTITY_MISMATCH",
          path: "inventory.WH-A.SKU-TEST.availableQuantity",
          message:
            "Inventory sources report different available quantities for WH-A/SKU-TEST.",
          observations: [
            {
              sourceSystem: "WAREHOUSE_SYSTEM",
              availableQuantity: 0,
              observedAt: baseInventory.observedAt,
            },
            {
              sourceSystem: "COMMERCE_SYSTEM",
              availableQuantity: 4,
              observedAt: baseInventory.observedAt,
            },
          ],
        },
      ],
    });
  });

  test("does not conflict when independent sources report equal quantities", () => {
    const result = evaluator.evaluate(
      buildSnapshot({
        inventoryObservations: [
          baseInventory,
          {
            ...baseInventory,
            sourceSystem: "COMMERCE_SYSTEM",
          },
        ],
      }),
    );

    expect(result.evidenceStatus).toBe("COMPLETE");
    expect(result.conflicts).toEqual([]);
  });

  test("orders missing fields and conflict observations with conflict precedence", () => {
    const skuBItem: CommerceOrderItemRecord = {
      ...baseItem,
      id: "ITEM-B",
      sku: "SKU-B",
    };
    const result = evaluator.evaluate(
      buildSnapshot({
        orderItems: [skuBItem, { ...baseItem, sku: "SKU-A" }],
        inventoryObservations: [
          {
            ...baseInventory,
            sku: "SKU-A",
            sourceSystem: "COMMERCE_SYSTEM",
            availableQuantity: 4,
          },
          { ...baseInventory, sku: "SKU-A" },
          {
            ...baseInventory,
            warehouseId: "WH-Z",
            sku: "SKU-A",
            availableQuantity: 2,
          },
        ],
        warehouses: [],
      }),
    );

    expect(result.evidenceStatus).toBe("CONFLICTING");
    expect(result.missingFields).toEqual([
      "inventory.assignedWarehouse.WH-A.SKU-B",
      "warehouses.WH-A",
      "warehouses.WH-Z",
    ]);
    expect(
      result.conflicts[0]?.observations.map(({ sourceSystem }) => sourceSystem),
    ).toEqual(["WAREHOUSE_SYSTEM", "COMMERCE_SYSTEM"]);
  });

  test("readiness result schema rejects contradictory or unordered output", () => {
    expect(
      EvidenceReadinessResultSchema.safeParse({
        schemaVersion: 1,
        orderId: ORDER_ID,
        evidenceStatus: "COMPLETE",
        missingFields: ["payment"],
        conflicts: [],
      }).success,
    ).toBeFalse();

    const conflicting = evaluator.evaluate(
      buildSnapshot({
        inventoryObservations: [
          baseInventory,
          {
            ...baseInventory,
            sourceSystem: "COMMERCE_SYSTEM",
            availableQuantity: 4,
          },
        ],
      }),
    );
    const reversed = structuredClone(conflicting);
    reversed.conflicts[0]!.observations.reverse();
    expect(
      EvidenceReadinessResultSchema.safeParse(reversed).success,
    ).toBeFalse();
  });
});
