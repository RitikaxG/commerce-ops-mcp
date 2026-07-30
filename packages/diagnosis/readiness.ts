import {
  EvidenceReadinessResultSchema,
  NormalizedOrderEvidenceSchema,
  type CommerceInventoryObservationRecord,
  type EvidenceConflict,
  type EvidenceMissingFieldPath,
  type EvidenceReadinessResult,
  type EvidenceSourceName,
  type NormalizedOrderEvidence,
} from "@repo/schemas";

export interface EvidenceReadinessEvaluator {
  evaluate(evidence: NormalizedOrderEvidence): EvidenceReadinessResult;
}

const inventorySourceOrder = {
  WAREHOUSE_SYSTEM: 0,
  COMMERCE_SYSTEM: 1,
} as const;

function compareText(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function result(
  orderId: string,
  missing: ReadonlySet<EvidenceMissingFieldPath>,
  conflicts: readonly EvidenceConflict[],
): EvidenceReadinessResult {
  const missingFields = [...missing].sort(compareText);
  const orderedConflicts = [...conflicts].sort((left, right) =>
    compareText(left.path, right.path),
  );
  const evidenceStatus =
    orderedConflicts.length > 0
      ? "CONFLICTING"
      : missingFields.length > 0
        ? "MISSING"
        : "COMPLETE";

  return EvidenceReadinessResultSchema.parse({
    schemaVersion: 1,
    orderId,
    evidenceStatus,
    missingFields,
    conflicts: orderedConflicts,
  });
}

function requireSource(
  evidence: NormalizedOrderEvidence,
  source: EvidenceSourceName,
  missing: Set<EvidenceMissingFieldPath>,
): boolean {
  const read = evidence.sourceReads.find(
    (sourceRead) => sourceRead.source === source,
  );
  if (read?.status === "SUCCEEDED") {
    return true;
  }

  missing.add(`sources.${source}` as EvidenceMissingFieldPath);
  return false;
}

function detectInventoryConflicts(
  observations: readonly CommerceInventoryObservationRecord[],
): EvidenceConflict[] {
  const groups = new Map<
    string,
    {
      warehouseId: string;
      sku: string;
      observations: CommerceInventoryObservationRecord[];
    }
  >();

  for (const observation of observations) {
    const key = `${observation.warehouseId}\u0000${observation.sku}`;
    const group = groups.get(key) ?? {
      warehouseId: observation.warehouseId,
      sku: observation.sku,
      observations: [],
    };
    group.observations.push(observation);
    groups.set(key, group);
  }

  return [...groups.values()]
    .sort((left, right) =>
      compareText(
        `${left.warehouseId}\u0000${left.sku}`,
        `${right.warehouseId}\u0000${right.sku}`,
      ),
    )
    .flatMap((group) => {
      const distinctSources = new Set(
        group.observations.map(({ sourceSystem }) => sourceSystem),
      );
      const distinctQuantities = new Set(
        group.observations.map(({ availableQuantity }) => availableQuantity),
      );
      if (distinctSources.size < 2 || distinctQuantities.size < 2) {
        return [];
      }

      const orderedObservations = [...group.observations]
        .sort(
          (left, right) =>
            inventorySourceOrder[left.sourceSystem] -
              inventorySourceOrder[right.sourceSystem] ||
            compareText(left.observedAt, right.observedAt) ||
            left.availableQuantity - right.availableQuantity,
        )
        .map(({ sourceSystem, availableQuantity, observedAt }) => ({
          sourceSystem,
          availableQuantity,
          observedAt,
        }));

      return [
        {
          code: "INVENTORY_QUANTITY_MISMATCH" as const,
          path: `inventory.${group.warehouseId}.${group.sku}.availableQuantity`,
          message: `Inventory sources report different available quantities for ${group.warehouseId}/${group.sku}.`,
          observations: orderedObservations,
        },
      ];
    });
}

class DefaultEvidenceReadinessEvaluator implements EvidenceReadinessEvaluator {
  evaluate(input: NormalizedOrderEvidence): EvidenceReadinessResult {
    const evidence = NormalizedOrderEvidenceSchema.parse(input);
    const missing = new Set<EvidenceMissingFieldPath>();

    const orderSourceAvailable = requireSource(evidence, "ORDER", missing);
    if (orderSourceAvailable && evidence.order === null) {
      missing.add("order");
    }

    const orderItemsSourceAvailable = requireSource(
      evidence,
      "ORDER_ITEMS",
      missing,
    );
    if (orderItemsSourceAvailable && evidence.orderItems.length === 0) {
      missing.add("orderItems");
    }

    const paymentSourceAvailable = requireSource(evidence, "PAYMENT", missing);
    if (paymentSourceAvailable && evidence.payment === null) {
      missing.add("payment");
    }

    if (missing.size > 0 || evidence.payment === null) {
      return result(evidence.orderId, missing, []);
    }

    if (evidence.payment.status !== "SUCCEEDED") {
      return result(evidence.orderId, missing, []);
    }

    const shipmentSourceAvailable = requireSource(
      evidence,
      "SHIPMENT",
      missing,
    );
    if (!shipmentSourceAvailable) {
      return result(evidence.orderId, missing, []);
    }
    if (evidence.shipment !== null) {
      return result(evidence.orderId, missing, []);
    }

    const eventSourceAvailable = requireSource(
      evidence,
      "FULFILMENT_EVENTS",
      missing,
    );
    if (!eventSourceAvailable) {
      return result(evidence.orderId, missing, []);
    }
    const hasDecisiveFailureEvent = evidence.fulfilmentEvents.some(
      ({ type, status }) =>
        status === "FAILED" &&
        (type === "FULFILMENT_CREATION_FAILED" ||
          type === "SHIPMENT_LABEL_CREATION_FAILED"),
    );
    if (hasDecisiveFailureEvent) {
      return result(evidence.orderId, missing, []);
    }

    const fulfilmentSourceAvailable = requireSource(
      evidence,
      "FULFILMENT",
      missing,
    );
    if (!fulfilmentSourceAvailable) {
      return result(evidence.orderId, missing, []);
    }
    if (evidence.fulfilment === null) {
      missing.add("fulfilment");
      return result(evidence.orderId, missing, []);
    }
    const assignedWarehouseId = evidence.fulfilment.assignedWarehouseId;
    if (assignedWarehouseId === null) {
      missing.add("fulfilment.assignedWarehouseId");
      return result(evidence.orderId, missing, []);
    }

    const inventorySourceAvailable = requireSource(
      evidence,
      "INVENTORY",
      missing,
    );
    const warehouseSourceAvailable = requireSource(
      evidence,
      "WAREHOUSES",
      missing,
    );

    const conflicts = inventorySourceAvailable
      ? detectInventoryConflicts(evidence.inventoryObservations)
      : [];

    if (inventorySourceAvailable) {
      const requiredSkus = new Set(evidence.orderItems.map(({ sku }) => sku));
      for (const sku of requiredSkus) {
        const hasAssignedObservation = evidence.inventoryObservations.some(
          (observation) =>
            observation.warehouseId === assignedWarehouseId &&
            observation.sku === sku,
        );
        if (!hasAssignedObservation) {
          missing.add(
            `inventory.assignedWarehouse.${assignedWarehouseId}.${sku}`,
          );
        }
      }
    }

    if (warehouseSourceAvailable) {
      const returnedWarehouseIds = new Set(
        evidence.warehouses.map(({ id }) => id),
      );
      const requiredWarehouseIds = new Set([
        assignedWarehouseId,
        ...evidence.inventoryObservations.map(({ warehouseId }) => warehouseId),
      ]);
      for (const warehouseId of requiredWarehouseIds) {
        if (!returnedWarehouseIds.has(warehouseId)) {
          missing.add(`warehouses.${warehouseId}`);
        }
      }
    }

    return result(evidence.orderId, missing, conflicts);
  }
}

export function createEvidenceReadinessEvaluator(): EvidenceReadinessEvaluator {
  return new DefaultEvidenceReadinessEvaluator();
}
