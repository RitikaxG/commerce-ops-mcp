import {
  DIAGNOSIS_SUPPORTING_FACT_CODES,
  EvidenceReadinessResultSchema,
  InvestigationDecisionSchema,
  NormalizedOrderEvidenceSchema,
  type CommerceFulfilmentEventRecord,
  type DiagnosisCode,
  type DiagnosisRuleId,
  type DiagnosisSupportingFact,
  type EvidenceReadinessResult,
  type InvestigationDecision,
  type NormalizedOrderEvidence,
  type ReviewQueue,
} from "@repo/schemas";

export interface DiagnosisEngine {
  decide(input: {
    evidence: NormalizedOrderEvidence;
    readiness: EvidenceReadinessResult;
  }): InvestigationDecision;
}

const PROCESSING_WINDOW_MINUTES = 240;
const PROCESSING_WINDOW_MS = PROCESSING_WINDOW_MINUTES * 60 * 1_000;
const NO_ALTERNATIVE_STEP =
  "Review the assigned-warehouse shortage; no eligible alternative warehouse is confirmed.";

const factCodeOrder = new Map(
  DIAGNOSIS_SUPPORTING_FACT_CODES.map((code, index) => [code, index]),
);

function compareText(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function orderFacts(
  facts: readonly DiagnosisSupportingFact[],
): DiagnosisSupportingFact[] {
  return [...facts].sort(
    (left, right) =>
      (factCodeOrder.get(left.code) ?? -1) -
        (factCodeOrder.get(right.code) ?? -1) ||
      compareText(left.path, right.path),
  );
}

function completeDecision(input: {
  evidence: NormalizedOrderEvidence;
  diagnosisCode: DiagnosisCode;
  matchedRule: DiagnosisRuleId;
  shouldEscalate: boolean;
  suggestedQueue: ReviewQueue | null;
  suggestedNextStep: string;
  supportingFacts: DiagnosisSupportingFact[];
  eligibleAlternativeWarehouseIds?: string[];
}): InvestigationDecision {
  return InvestigationDecisionSchema.parse({
    schemaVersion: 1,
    orderId: input.evidence.orderId,
    investigationStatus: "COMPLETED",
    evidenceStatus: "COMPLETE",
    diagnosisCode: input.diagnosisCode,
    confidence: "CONFIRMED",
    matchedRule: input.matchedRule,
    shouldEscalate: input.shouldEscalate,
    suggestedQueue: input.suggestedQueue,
    suggestedNextStep: input.suggestedNextStep,
    supportingFacts: orderFacts(input.supportingFacts),
    eligibleAlternativeWarehouseIds:
      input.eligibleAlternativeWarehouseIds ?? [],
    commerceStateChanged: false,
  });
}

function incompleteDecision(
  evidence: NormalizedOrderEvidence,
  readiness: EvidenceReadinessResult,
): InvestigationDecision {
  const missing = readiness.evidenceStatus === "MISSING";

  return InvestigationDecisionSchema.parse({
    schemaVersion: 1,
    orderId: evidence.orderId,
    investigationStatus: "NEEDS_MORE_INFO",
    evidenceStatus: readiness.evidenceStatus,
    diagnosisCode: null,
    confidence: null,
    matchedRule: null,
    shouldEscalate: true,
    suggestedQueue: "OPERATIONS_DATA_REVIEW",
    suggestedNextStep: missing
      ? "Verify the missing assigned-warehouse inventory evidence."
      : "Resolve the conflicting inventory observations before suggesting a warehouse.",
    supportingFacts: [
      missing
        ? {
            code: "MISSING_EVIDENCE",
            path: "readiness.missingFields",
            value: readiness.missingFields,
          }
        : {
            code: "CONFLICTING_EVIDENCE",
            path: "readiness.conflicts",
            value: readiness.conflicts,
          },
    ],
    eligibleAlternativeWarehouseIds: [],
    commerceStateChanged: false,
  });
}

function latestEvent(
  events: readonly CommerceFulfilmentEventRecord[],
): CommerceFulfilmentEventRecord | null {
  return (
    [...events].sort(
      (left, right) =>
        compareText(right.occurredAt, left.occurredAt) ||
        compareText(right.id, left.id),
    )[0] ?? null
  );
}

function selectLatestDecisiveFailure(
  evidence: NormalizedOrderEvidence,
): CommerceFulfilmentEventRecord | null {
  const referenceTime = Date.parse(evidence.collectedAt);
  return latestEvent(
    evidence.fulfilmentEvents.filter(
      (event) =>
        event.status === "FAILED" &&
        (event.type === "FULFILMENT_CREATION_FAILED" ||
          event.type === "SHIPMENT_LABEL_CREATION_FAILED") &&
        Date.parse(event.occurredAt) <= referenceTime,
    ),
  );
}

function requiredQuantityBySku(
  evidence: NormalizedOrderEvidence,
): Map<string, number> {
  return new Map(evidence.orderItems.map((item) => [item.sku, item.quantity]));
}

function agreedQuantity(
  evidence: NormalizedOrderEvidence,
  warehouseId: string,
  sku: string,
): number | null {
  const quantities = new Set(
    evidence.inventoryObservations
      .filter(
        (observation) =>
          observation.warehouseId === warehouseId && observation.sku === sku,
      )
      .map(({ availableQuantity }) => availableQuantity),
  );
  if (quantities.size !== 1) {
    return null;
  }
  return quantities.values().next().value ?? null;
}

function eligibleAlternativeWarehouseIds(
  evidence: NormalizedOrderEvidence,
  assignedWarehouseId: string,
  required: ReadonlyMap<string, number>,
): string[] {
  return evidence.warehouses
    .filter(
      (warehouse) =>
        warehouse.id !== assignedWarehouseId &&
        warehouse.active &&
        [...required].every(([sku, requiredQuantity]) => {
          const availableQuantity = agreedQuantity(evidence, warehouse.id, sku);
          return (
            availableQuantity !== null && availableQuantity >= requiredQuantity
          );
        }),
    )
    .map(({ id }) => id)
    .filter((id, index, ids) => ids.indexOf(id) === index)
    .sort(compareText);
}

function assignedWarehouseShortageDecision(
  evidence: NormalizedOrderEvidence,
): InvestigationDecision | null {
  const fulfilment = evidence.fulfilment;
  if (
    fulfilment?.status !== "ON_HOLD" ||
    fulfilment.holdReason !== "INVENTORY_OUT_OF_STOCK" ||
    fulfilment.assignedWarehouseId === null
  ) {
    return null;
  }

  const required = requiredQuantityBySku(evidence);
  const shortages = [...required]
    .map(([sku, requiredQuantity]) => ({
      sku,
      requiredQuantity,
      availableQuantity: agreedQuantity(
        evidence,
        fulfilment.assignedWarehouseId!,
        sku,
      ),
    }))
    .filter(
      (
        shortage,
      ): shortage is {
        sku: string;
        requiredQuantity: number;
        availableQuantity: number;
      } =>
        shortage.availableQuantity !== null &&
        shortage.availableQuantity < shortage.requiredQuantity,
    )
    .sort((left, right) => compareText(left.sku, right.sku));

  if (shortages.length === 0) {
    return null;
  }

  const alternatives = eligibleAlternativeWarehouseIds(
    evidence,
    fulfilment.assignedWarehouseId,
    required,
  );
  const facts: DiagnosisSupportingFact[] = [
    {
      code: "FULFILMENT_STATE",
      path: "fulfilment",
      value: {
        status: fulfilment.status,
        holdReason: fulfilment.holdReason,
        assignedWarehouseId: fulfilment.assignedWarehouseId,
      },
    },
    ...shortages.map(({ sku, requiredQuantity, availableQuantity }) => ({
      code: "ASSIGNED_WAREHOUSE_STOCK" as const,
      path: `inventory.assignedWarehouse.${fulfilment.assignedWarehouseId}.${sku}`,
      value: { requiredQuantity, availableQuantity },
    })),
    {
      code: "ELIGIBLE_ALTERNATIVE_WAREHOUSES",
      path: "warehouses.eligibleAlternativeIds",
      value: alternatives,
    },
  ];

  return completeDecision({
    evidence,
    diagnosisCode: "ASSIGNED_WAREHOUSE_OUT_OF_STOCK",
    matchedRule: "assigned_warehouse_out_of_stock.v1",
    shouldEscalate: true,
    suggestedQueue: "FULFILMENT_OPERATIONS",
    suggestedNextStep:
      alternatives.length > 0
        ? "Review reassignment to an eligible warehouse; do not change commerce state automatically."
        : NO_ALTERNATIVE_STEP,
    supportingFacts: facts,
    eligibleAlternativeWarehouseIds: alternatives,
  });
}

function withinExpectedProcessingDecision(
  evidence: NormalizedOrderEvidence,
): InvestigationDecision | null {
  if (evidence.fulfilment?.status !== "PROCESSING") {
    return null;
  }

  const referenceTime = Date.parse(evidence.collectedAt);
  const processingEvent = latestEvent(
    evidence.fulfilmentEvents.filter(
      (event) =>
        event.type === "PROCESSING_STARTED" &&
        event.status === "SUCCEEDED" &&
        Date.parse(event.occurredAt) <= referenceTime,
    ),
  );
  if (processingEvent === null) {
    return null;
  }

  const elapsedMs = referenceTime - Date.parse(processingEvent.occurredAt);
  if (elapsedMs < 0 || elapsedMs > PROCESSING_WINDOW_MS) {
    return null;
  }

  return completeDecision({
    evidence,
    diagnosisCode: "WITHIN_EXPECTED_PROCESSING_TIME",
    matchedRule: "within_expected_processing_time.v1",
    shouldEscalate: false,
    suggestedQueue: null,
    suggestedNextStep:
      "Continue normal monitoring within the expected processing window.",
    supportingFacts: [
      {
        code: "PROCESSING_WINDOW",
        path: "fulfilmentEvents.processingStarted",
        value: {
          eventId: processingEvent.id,
          processingStartedAt: processingEvent.occurredAt,
          decisionReferenceAt: evidence.collectedAt,
          elapsedMinutes: elapsedMs / 60_000,
          windowMinutes: PROCESSING_WINDOW_MINUTES,
        },
      },
    ],
  });
}

class DefaultDiagnosisEngine implements DiagnosisEngine {
  decide(input: {
    evidence: NormalizedOrderEvidence;
    readiness: EvidenceReadinessResult;
  }): InvestigationDecision {
    const evidence = NormalizedOrderEvidenceSchema.parse(input.evidence);
    const readiness = EvidenceReadinessResultSchema.parse(input.readiness);

    if (evidence.orderId !== readiness.orderId) {
      throw new Error("Evidence and readiness order IDs must match");
    }

    if (readiness.evidenceStatus !== "COMPLETE") {
      return incompleteDecision(evidence, readiness);
    }

    if (evidence.payment?.status !== "SUCCEEDED") {
      return completeDecision({
        evidence,
        diagnosisCode: "PAYMENT_NOT_CONFIRMED",
        matchedRule: "payment_not_confirmed.v1",
        shouldEscalate: true,
        suggestedQueue: "PAYMENT_OPERATIONS",
        suggestedNextStep:
          "Review the authoritative payment source before treating the order as paid.",
        supportingFacts: [
          {
            code: "PAYMENT_STATUS",
            path: "payment.status",
            value: evidence.payment?.status ?? null,
          },
        ],
      });
    }

    if (evidence.shipment !== null) {
      return completeDecision({
        evidence,
        diagnosisCode: "SHIPMENT_ALREADY_EXISTS",
        matchedRule: "shipment_already_exists.v1",
        shouldEscalate: false,
        suggestedQueue: null,
        suggestedNextStep:
          "Verify whether the operator view is stale because a shipment already exists.",
        supportingFacts: [
          {
            code: "SHIPMENT_PRESENT",
            path: "shipment",
            value: {
              id: evidence.shipment.id,
              status: evidence.shipment.status,
            },
          },
        ],
      });
    }

    const failureEvent = selectLatestDecisiveFailure(evidence);
    if (failureEvent !== null) {
      const creationFailure =
        failureEvent.type === "FULFILMENT_CREATION_FAILED";
      return completeDecision({
        evidence,
        diagnosisCode: creationFailure
          ? "FULFILMENT_CREATION_FAILED"
          : "SHIPMENT_LABEL_CREATION_FAILED",
        matchedRule: creationFailure
          ? "fulfilment_creation_failed.v1"
          : "shipment_label_creation_failed.v1",
        shouldEscalate: true,
        suggestedQueue: creationFailure
          ? "FULFILMENT_OPERATIONS"
          : "SHIPPING_OPERATIONS",
        suggestedNextStep: creationFailure
          ? "Review the confirmed fulfilment creation failure; do not retry fulfilment automatically."
          : "Review the shipment-label failure; do not retry or change fulfilment automatically.",
        supportingFacts: [
          {
            code: "FAILURE_EVENT",
            path: `fulfilmentEvents.${failureEvent.id}`,
            value: {
              id: failureEvent.id,
              type: failureEvent.type,
              status: failureEvent.status,
              occurredAt: failureEvent.occurredAt,
            },
          },
        ],
      });
    }

    const shortageDecision = assignedWarehouseShortageDecision(evidence);
    if (shortageDecision !== null) {
      return shortageDecision;
    }

    const processingDecision = withinExpectedProcessingDecision(evidence);
    if (processingDecision !== null) {
      return processingDecision;
    }

    const fallbackFacts: DiagnosisSupportingFact[] = [
      {
        code: "PAYMENT_STATUS",
        path: "payment.status",
        value: evidence.payment.status,
      },
      ...(evidence.fulfilment === null
        ? []
        : [
            {
              code: "FULFILMENT_STATE" as const,
              path: "fulfilment.status",
              value: evidence.fulfilment.status,
            },
          ]),
      {
        code: "NO_SUPPORTED_RULE",
        path: "diagnosis",
        value: "No earlier deterministic rule matched the complete evidence.",
      },
    ];

    return completeDecision({
      evidence,
      diagnosisCode: "CAUSE_NOT_DETERMINED",
      matchedRule: "cause_not_determined.v1",
      shouldEscalate: true,
      suggestedQueue: "GENERAL_COMMERCE_OPERATIONS",
      suggestedNextStep: "Review the order manually without inventing a cause.",
      supportingFacts: fallbackFacts,
    });
  }
}

export function createDiagnosisEngine(): DiagnosisEngine {
  return new DefaultDiagnosisEngine();
}
