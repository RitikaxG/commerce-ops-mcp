import { describe, expect, test } from "bun:test";
import {
  EVIDENCE_SOURCE_NAMES,
  InvestigationDecisionSchema,
  NormalizedOrderEvidenceSchema,
  type CommerceFulfilmentEventRecord,
  type CommerceInventoryObservationRecord,
  type CommerceOrderItemRecord,
  type CommerceWarehouseRecord,
  type EvidenceReadinessResult,
  type EvidenceSourceName,
  type NormalizedOrderEvidence,
} from "@repo/schemas";

import {
  createDiagnosisEngine,
  createEvidenceReadinessEvaluator,
} from "../index.js";

const ORDER_ID = "ORD-TEST";
const COLLECTED_AT = "2026-07-30T12:00:00.000Z";

interface EvidenceOverrides {
  orderId?: string;
  collectedAt?: string;
  paymentStatus?: "SUCCEEDED" | "PROCESSING" | "FAILED";
  shipment?: NormalizedOrderEvidence["shipment"];
  fulfilment?: NormalizedOrderEvidence["fulfilment"];
  fulfilmentEvents?: CommerceFulfilmentEventRecord[];
  orderItems?: CommerceOrderItemRecord[];
  inventoryObservations?: CommerceInventoryObservationRecord[];
  warehouses?: CommerceWarehouseRecord[];
}

function buildEvidence(
  overrides: EvidenceOverrides = {},
): NormalizedOrderEvidence {
  const orderId = overrides.orderId ?? ORDER_ID;
  const orderItems = overrides.orderItems ?? [
    {
      id: "ITEM-TEST-1",
      orderId,
      sku: "SKU-A",
      quantity: 2,
      createdAt: "2026-07-28T09:00:00.000Z",
    },
  ];
  const fulfilment = Object.hasOwn(overrides, "fulfilment")
    ? (overrides.fulfilment ?? null)
    : {
        id: "FUL-TEST",
        orderId,
        status: "PROCESSING" as const,
        holdReason: null,
        assignedWarehouseId: "WH-A",
        providerReference: "FULFILMENT-SOURCE-TEST",
        createdAt: "2026-07-30T07:00:00.000Z",
        updatedAt: "2026-07-30T07:30:00.000Z",
        observedAt: COLLECTED_AT,
      };
  const shipment = overrides.shipment ?? null;
  const fulfilmentEvents = overrides.fulfilmentEvents ?? [];
  const inventoryObservations = overrides.inventoryObservations ?? [
    {
      warehouseId: "WH-A",
      sku: "SKU-A",
      sourceSystem: "WAREHOUSE_SYSTEM" as const,
      availableQuantity: 3,
      observedAt: COLLECTED_AT,
    },
  ];
  const warehouses = overrides.warehouses ?? [
    {
      id: "WH-A",
      name: "Warehouse A",
      active: true,
      createdAt: "2026-07-28T09:00:00.000Z",
    },
  ];

  const recordCounts = {
    ORDER: 1,
    ORDER_ITEMS: orderItems.length,
    PAYMENT: 1,
    FULFILMENT: fulfilment === null ? 0 : 1,
    FULFILMENT_EVENTS: fulfilmentEvents.length,
    SHIPMENT: shipment === null ? 0 : 1,
    INVENTORY: inventoryObservations.length,
    WAREHOUSES: warehouses.length,
  } satisfies Record<EvidenceSourceName, number>;

  return NormalizedOrderEvidenceSchema.parse({
    schemaVersion: 1,
    orderId,
    collectedAt: overrides.collectedAt ?? COLLECTED_AT,
    order: {
      id: orderId,
      status: "CONFIRMED",
      createdAt: "2026-07-28T09:00:00.000Z",
      updatedAt: COLLECTED_AT,
    },
    orderItems,
    payment: {
      id: "PAY-TEST",
      orderId,
      status: overrides.paymentStatus ?? "SUCCEEDED",
      amount: "49.99",
      currency: "USD",
      providerReference: "PAYMENT-SOURCE-TEST",
      observedAt: COLLECTED_AT,
    },
    fulfilment,
    fulfilmentEvents,
    shipment,
    inventoryObservations,
    warehouses,
    sourceReads: EVIDENCE_SOURCE_NAMES.map((source) => ({
      source,
      status: "SUCCEEDED",
      readAt: COLLECTED_AT,
      latestSourceTimestamp: recordCounts[source] === 0 ? null : COLLECTED_AT,
      recordCount: recordCounts[source],
      errorCode: null,
    })),
  });
}

function completeReadiness(orderId = ORDER_ID): EvidenceReadinessResult {
  return {
    schemaVersion: 1,
    orderId,
    evidenceStatus: "COMPLETE",
    missingFields: [],
    conflicts: [],
  };
}

function event(input: {
  id: string;
  type:
    | "FULFILMENT_CREATION_FAILED"
    | "SHIPMENT_LABEL_CREATION_FAILED"
    | "PROCESSING_STARTED";
  status: "SUCCEEDED" | "FAILED";
  occurredAt: string;
}): CommerceFulfilmentEventRecord {
  return {
    id: input.id,
    orderId: ORDER_ID,
    fulfilmentId:
      input.type === "FULFILMENT_CREATION_FAILED" ? null : "FUL-TEST",
    sourceEventReference: `SOURCE-${input.id}`,
    type: input.type,
    status: input.status,
    details: {},
    occurredAt: input.occurredAt,
  };
}

const engine = createDiagnosisEngine();

describe("diagnosis engine", () => {
  test("stops missing and conflicting evidence without a diagnosis", () => {
    const evidence = buildEvidence();
    const cases: EvidenceReadinessResult[] = [
      {
        schemaVersion: 1,
        orderId: ORDER_ID,
        evidenceStatus: "MISSING",
        missingFields: ["inventory.assignedWarehouse.WH-A.SKU-A"],
        conflicts: [],
      },
      {
        schemaVersion: 1,
        orderId: ORDER_ID,
        evidenceStatus: "CONFLICTING",
        missingFields: [],
        conflicts: [
          {
            code: "INVENTORY_QUANTITY_MISMATCH",
            path: "inventory.WH-A.SKU-A.availableQuantity",
            message:
              "Inventory sources report different available quantities for WH-A/SKU-A.",
            observations: [
              {
                sourceSystem: "WAREHOUSE_SYSTEM",
                availableQuantity: 0,
                observedAt: COLLECTED_AT,
              },
              {
                sourceSystem: "COMMERCE_SYSTEM",
                availableQuantity: 4,
                observedAt: COLLECTED_AT,
              },
            ],
          },
        ],
      },
    ];

    const decisions = cases.map((readiness) =>
      engine.decide({ evidence, readiness }),
    );
    for (const decision of decisions) {
      expect(decision).toMatchObject({
        investigationStatus: "NEEDS_MORE_INFO",
        diagnosisCode: null,
        confidence: null,
        matchedRule: null,
        shouldEscalate: true,
        suggestedQueue: "OPERATIONS_DATA_REVIEW",
        eligibleAlternativeWarehouseIds: [],
        commerceStateChanged: false,
      });
    }
    expect(decisions[0]?.supportingFacts[0]?.code).toBe("MISSING_EVIDENCE");
    expect(decisions[1]?.supportingFacts[0]?.code).toBe("CONFLICTING_EVIDENCE");
  });

  test("uses generic missing-evidence guidance for a non-scenario source failure", () => {
    const input = buildEvidence();
    const paymentReadIndex = input.sourceReads.findIndex(
      ({ source }) => source === "PAYMENT",
    );
    const evidence = NormalizedOrderEvidenceSchema.parse({
      ...input,
      payment: null,
      sourceReads: input.sourceReads.map((read, index) =>
        index === paymentReadIndex
          ? {
              ...read,
              status: "FAILED",
              latestSourceTimestamp: null,
              recordCount: 0,
              errorCode: "SOURCE_READ_FAILED",
            }
          : read,
      ),
    });
    const readiness = createEvidenceReadinessEvaluator().evaluate(evidence);
    const decision = engine.decide({ evidence, readiness });

    expect(readiness.missingFields).toContain("sources.PAYMENT");
    expect(decision.suggestedNextStep).toBe(
      "Verify the missing commerce evidence identified in the investigation.",
    );
    expect(decision.supportingFacts).toContainEqual({
      code: "MISSING_EVIDENCE",
      path: "readiness.missingFields",
      value: readiness.missingFields,
    });
  });

  test("payment and shipment precedence outrank downstream history", () => {
    const historicalFailure = event({
      id: "EVENT-FAILED",
      type: "SHIPMENT_LABEL_CREATION_FAILED",
      status: "FAILED",
      occurredAt: "2026-07-30T10:00:00.000Z",
    });
    const shipment = {
      id: "SHIP-TEST",
      orderId: ORDER_ID,
      fulfilmentId: "FUL-TEST",
      status: "CREATED" as const,
      providerReference: "SHIPMENT-SOURCE-TEST",
      createdAt: "2026-07-30T11:00:00.000Z",
      observedAt: COLLECTED_AT,
    };

    expect(
      engine.decide({
        evidence: buildEvidence({
          paymentStatus: "PROCESSING",
          shipment,
          fulfilmentEvents: [historicalFailure],
        }),
        readiness: completeReadiness(),
      }).diagnosisCode,
    ).toBe("PAYMENT_NOT_CONFIRMED");

    expect(
      engine.decide({
        evidence: buildEvidence({
          shipment,
          fulfilmentEvents: [historicalFailure],
        }),
        readiness: completeReadiness(),
      }).diagnosisCode,
    ).toBe("SHIPMENT_ALREADY_EXISTS");
  });

  test("chooses the latest failed event with greatest-ID tie-breaking and ignores succeeded failure types", () => {
    const evidence = buildEvidence({
      fulfilmentEvents: [
        event({
          id: "EVENT-OLDER",
          type: "SHIPMENT_LABEL_CREATION_FAILED",
          status: "FAILED",
          occurredAt: "2026-07-30T09:00:00.000Z",
        }),
        event({
          id: "EVENT-A",
          type: "FULFILMENT_CREATION_FAILED",
          status: "FAILED",
          occurredAt: "2026-07-30T10:00:00.000Z",
        }),
        event({
          id: "EVENT-Z",
          type: "SHIPMENT_LABEL_CREATION_FAILED",
          status: "FAILED",
          occurredAt: "2026-07-30T10:00:00.000Z",
        }),
        event({
          id: "EVENT-SUCCEEDED",
          type: "FULFILMENT_CREATION_FAILED",
          status: "SUCCEEDED",
          occurredAt: "2026-07-30T11:00:00.000Z",
        }),
      ],
    });
    const decision = engine.decide({
      evidence,
      readiness: completeReadiness(),
    });

    expect(decision.diagnosisCode).toBe("SHIPMENT_LABEL_CREATION_FAILED");
    expect(decision.supportingFacts[0]?.value).toMatchObject({
      id: "EVENT-Z",
      status: "FAILED",
    });

    const succeededOnly = engine.decide({
      evidence: buildEvidence({
        fulfilmentEvents: [
          event({
            id: "EVENT-SUCCEEDED",
            type: "FULFILMENT_CREATION_FAILED",
            status: "SUCCEEDED",
            occurredAt: "2026-07-30T11:00:00.000Z",
          }),
        ],
      }),
      readiness: completeReadiness(),
    });
    expect(succeededOnly.diagnosisCode).toBe("CAUSE_NOT_DETERMINED");
  });

  test("compares required quantities and returns only complete active alternatives", () => {
    const orderItems = [
      {
        id: "ITEM-A",
        orderId: ORDER_ID,
        sku: "SKU-A",
        quantity: 2,
        createdAt: "2026-07-28T09:00:00.000Z",
      },
      {
        id: "ITEM-B",
        orderId: ORDER_ID,
        sku: "SKU-B",
        quantity: 3,
        createdAt: "2026-07-28T09:00:00.000Z",
      },
    ];
    const warehouses = [
      { id: "WH-A", name: "A", active: true },
      { id: "WH-B", name: "B", active: true },
      { id: "WH-C", name: "C", active: false },
      { id: "WH-D", name: "D", active: true },
      { id: "WH-E", name: "E", active: true },
    ].map((warehouse) => ({
      ...warehouse,
      createdAt: "2026-07-28T09:00:00.000Z",
    }));
    const observation = (
      warehouseId: string,
      sku: string,
      availableQuantity: number,
      sourceSystem: "WAREHOUSE_SYSTEM" | "COMMERCE_SYSTEM" = "WAREHOUSE_SYSTEM",
    ) => ({
      warehouseId,
      sku,
      sourceSystem,
      availableQuantity,
      observedAt: COLLECTED_AT,
    });
    const evidence = buildEvidence({
      orderItems,
      fulfilment: {
        ...buildEvidence().fulfilment!,
        status: "ON_HOLD",
        holdReason: "INVENTORY_OUT_OF_STOCK",
      },
      warehouses,
      inventoryObservations: [
        observation("WH-A", "SKU-A", 1),
        observation("WH-A", "SKU-B", 3),
        observation("WH-B", "SKU-A", 2),
        observation("WH-B", "SKU-B", 3),
        observation("WH-C", "SKU-A", 9),
        observation("WH-C", "SKU-B", 9),
        observation("WH-D", "SKU-A", 2),
        observation("WH-D", "SKU-B", 2),
        observation("WH-E", "SKU-A", 4),
        observation("WH-E", "SKU-A", 5, "COMMERCE_SYSTEM"),
        observation("WH-E", "SKU-B", 4),
      ],
    });

    const decision = engine.decide({
      evidence,
      readiness: completeReadiness(),
    });
    expect(decision.diagnosisCode).toBe("ASSIGNED_WAREHOUSE_OUT_OF_STOCK");
    expect(decision.eligibleAlternativeWarehouseIds).toEqual(["WH-B"]);
    expect(decision.supportingFacts).toContainEqual({
      code: "ASSIGNED_WAREHOUSE_STOCK",
      path: "inventory.assignedWarehouse.WH-A.SKU-A",
      value: { requiredQuantity: 2, availableQuantity: 1 },
    });
    expect(decision.commerceStateChanged).toBeFalse();
  });

  test("uses collectedAt for the inclusive four-hour processing window and rejects future events", () => {
    const atBoundary = engine.decide({
      evidence: buildEvidence({
        fulfilmentEvents: [
          event({
            id: "EVENT-PROCESSING",
            type: "PROCESSING_STARTED",
            status: "SUCCEEDED",
            occurredAt: "2026-07-30T08:00:00.000Z",
          }),
        ],
      }),
      readiness: completeReadiness(),
    });
    expect(atBoundary.diagnosisCode).toBe("WITHIN_EXPECTED_PROCESSING_TIME");
    expect(atBoundary.supportingFacts[0]?.value).toMatchObject({
      processingStartedAt: "2026-07-30T08:00:00.000Z",
      decisionReferenceAt: COLLECTED_AT,
      elapsedMinutes: 240,
      windowMinutes: 240,
    });

    const future = engine.decide({
      evidence: buildEvidence({
        fulfilmentEvents: [
          event({
            id: "EVENT-FUTURE",
            type: "PROCESSING_STARTED",
            status: "SUCCEEDED",
            occurredAt: "2026-07-30T12:01:00.000Z",
          }),
        ],
      }),
      readiness: completeReadiness(),
    });
    expect(future.diagnosisCode).toBe("CAUSE_NOT_DETERMINED");
  });

  test("rejects mismatched IDs and contradictory decision contracts", () => {
    expect(() =>
      engine.decide({
        evidence: buildEvidence(),
        readiness: completeReadiness("ORD-OTHER"),
      }),
    ).toThrow("Evidence and readiness order IDs must match");

    const valid = engine.decide({
      evidence: buildEvidence({ paymentStatus: "PROCESSING" }),
      readiness: completeReadiness(),
    });
    expect(
      InvestigationDecisionSchema.safeParse({
        ...valid,
        shouldEscalate: false,
        suggestedQueue: "PAYMENT_OPERATIONS",
      }).success,
    ).toBeFalse();
    expect(
      InvestigationDecisionSchema.safeParse({
        ...valid,
        diagnosisCode: "SHIPMENT_ALREADY_EXISTS",
      }).success,
    ).toBeFalse();

    const missing = engine.decide({
      evidence: buildEvidence(),
      readiness: {
        schemaVersion: 1,
        orderId: ORDER_ID,
        evidenceStatus: "MISSING",
        missingFields: ["inventory.assignedWarehouse.WH-A.SKU-A"],
        conflicts: [],
      },
    });
    expect(
      InvestigationDecisionSchema.safeParse({
        ...missing,
        suggestedNextStep: "Warehouse reassignment completed.",
      }).success,
    ).toBeFalse();
  });

  test("is deterministic and does not mutate its inputs", () => {
    const evidence = buildEvidence({
      paymentStatus: "PROCESSING",
      inventoryObservations: [
        {
          warehouseId: "WH-A",
          sku: "SKU-A",
          sourceSystem: "WAREHOUSE_SYSTEM",
          availableQuantity: 1,
          observedAt: COLLECTED_AT,
        },
      ],
    });
    const readiness = completeReadiness();
    const before = structuredClone({ evidence, readiness });

    const first = engine.decide({ evidence, readiness });
    const second = engine.decide({ evidence, readiness });

    expect(second).toEqual(first);
    expect({ evidence, readiness }).toEqual(before);
    expect(InvestigationDecisionSchema.parse(first)).toEqual(first);
  });

  test("matches an ORD-1042-equivalent shortage through the readiness gate", () => {
    const evidence = buildEvidence({
      fulfilment: {
        ...buildEvidence().fulfilment!,
        status: "ON_HOLD",
        holdReason: "INVENTORY_OUT_OF_STOCK",
      },
      warehouses: [
        {
          id: "WH-A",
          name: "Warehouse A",
          active: true,
          createdAt: "2026-07-28T09:00:00.000Z",
        },
        {
          id: "WH-B",
          name: "Warehouse B",
          active: true,
          createdAt: "2026-07-28T09:00:00.000Z",
        },
      ],
      inventoryObservations: [
        {
          warehouseId: "WH-A",
          sku: "SKU-A",
          sourceSystem: "WAREHOUSE_SYSTEM",
          availableQuantity: 0,
          observedAt: COLLECTED_AT,
        },
        {
          warehouseId: "WH-B",
          sku: "SKU-A",
          sourceSystem: "WAREHOUSE_SYSTEM",
          availableQuantity: 3,
          observedAt: COLLECTED_AT,
        },
      ],
    });
    const readiness = createEvidenceReadinessEvaluator().evaluate(evidence);
    const decision = engine.decide({ evidence, readiness });

    expect(decision).toMatchObject({
      diagnosisCode: "ASSIGNED_WAREHOUSE_OUT_OF_STOCK",
      matchedRule: "assigned_warehouse_out_of_stock.v1",
      eligibleAlternativeWarehouseIds: ["WH-B"],
      suggestedNextStep:
        "Review reassignment to an eligible warehouse; do not change commerce state automatically.",
      commerceStateChanged: false,
    });
  });
});
