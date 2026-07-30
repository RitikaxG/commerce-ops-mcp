import {
  ApprovedScenarioManifestSchema,
  CommerceFixtureSetSchema,
  type ApprovedScenario,
  type CommerceFixtureSet,
} from "@repo/schemas";

export class FixtureValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FixtureValidationError";
  }
}

function assertUnique<T>(
  values: readonly T[],
  keyFor: (value: T) => string,
  label: string,
): void {
  const seen = new Set<string>();

  for (const value of values) {
    const key = keyFor(value);
    if (seen.has(key)) {
      throw new FixtureValidationError(`Duplicate ${label}: ${key}`);
    }
    seen.add(key);
  }
}

export function validateFixtureShapes(
  fixtures: unknown,
  scenarios: unknown,
): {
  fixtures: CommerceFixtureSet;
  scenarios: ApprovedScenario[];
} {
  const parsedFixtures = CommerceFixtureSetSchema.parse(fixtures);
  const parsedScenarios = ApprovedScenarioManifestSchema.parse(scenarios);

  assertUnique(parsedFixtures.orders, ({ id }) => id, "order ID");
  assertUnique(parsedFixtures.orderItems, ({ id }) => id, "order-item ID");
  assertUnique(parsedFixtures.payments, ({ id }) => id, "payment ID");
  assertUnique(parsedFixtures.warehouses, ({ id }) => id, "warehouse ID");
  assertUnique(
    parsedFixtures.inventoryObservations,
    ({ warehouseId, sku, sourceSystem }) =>
      `${warehouseId}/${sku}/${sourceSystem}`,
    "inventory observation key",
  );
  assertUnique(parsedFixtures.fulfilments, ({ id }) => id, "fulfilment ID");
  assertUnique(
    parsedFixtures.fulfilmentEvents,
    ({ id }) => id,
    "fulfilment-event ID",
  );
  assertUnique(parsedFixtures.shipments, ({ id }) => id, "shipment ID");
  assertUnique(parsedScenarios, ({ orderId }) => orderId, "scenario order ID");

  return {
    fixtures: parsedFixtures,
    scenarios: parsedScenarios,
  };
}

export function validateFixtureRelationships(
  fixtures: CommerceFixtureSet,
  scenarios: readonly ApprovedScenario[],
): void {
  const orderIds = new Set(fixtures.orders.map(({ id }) => id));
  const warehouseIds = new Set(fixtures.warehouses.map(({ id }) => id));
  const fulfilmentsById = new Map(
    fixtures.fulfilments.map((fulfilment) => [fulfilment.id, fulfilment]),
  );

  const assertOrder = (orderId: string, label: string) => {
    if (!orderIds.has(orderId)) {
      throw new FixtureValidationError(
        `${label} references unknown order ${orderId}`,
      );
    }
  };

  for (const item of fixtures.orderItems) {
    assertOrder(item.orderId, `Order item ${item.id}`);
  }

  for (const payment of fixtures.payments) {
    assertOrder(payment.orderId, `Payment ${payment.id}`);
  }

  for (const fulfilment of fixtures.fulfilments) {
    assertOrder(fulfilment.orderId, `Fulfilment ${fulfilment.id}`);

    if (
      fulfilment.assignedWarehouseId !== null &&
      !warehouseIds.has(fulfilment.assignedWarehouseId)
    ) {
      throw new FixtureValidationError(
        `Fulfilment ${fulfilment.id} references unknown warehouse ${fulfilment.assignedWarehouseId}`,
      );
    }
  }

  for (const observation of fixtures.inventoryObservations) {
    if (!warehouseIds.has(observation.warehouseId)) {
      throw new FixtureValidationError(
        `Inventory observation references unknown warehouse ${observation.warehouseId}`,
      );
    }
  }

  for (const event of fixtures.fulfilmentEvents) {
    assertOrder(event.orderId, `Fulfilment event ${event.id}`);

    if (event.fulfilmentId === null) {
      if (event.type !== "FULFILMENT_CREATION_FAILED") {
        throw new FixtureValidationError(
          `Fulfilment event ${event.id} may omit fulfilmentId only for a creation failure`,
        );
      }
      continue;
    }

    const fulfilment = fulfilmentsById.get(event.fulfilmentId);
    if (!fulfilment) {
      throw new FixtureValidationError(
        `Fulfilment event ${event.id} references unknown fulfilment ${event.fulfilmentId}`,
      );
    }
    if (fulfilment.orderId !== event.orderId) {
      throw new FixtureValidationError(
        `Fulfilment event ${event.id} and fulfilment ${fulfilment.id} belong to different orders`,
      );
    }
  }

  for (const shipment of fixtures.shipments) {
    assertOrder(shipment.orderId, `Shipment ${shipment.id}`);

    if (shipment.fulfilmentId === null) {
      continue;
    }

    const fulfilment = fulfilmentsById.get(shipment.fulfilmentId);
    if (!fulfilment) {
      throw new FixtureValidationError(
        `Shipment ${shipment.id} references unknown fulfilment ${shipment.fulfilmentId}`,
      );
    }
    if (fulfilment.orderId !== shipment.orderId) {
      throw new FixtureValidationError(
        `Shipment ${shipment.id} and fulfilment ${fulfilment.id} belong to different orders`,
      );
    }
  }

  const declaredOrderIds = new Set(scenarios.map(({ orderId }) => orderId));
  for (const orderId of declaredOrderIds) {
    if (!orderIds.has(orderId)) {
      throw new FixtureValidationError(
        `Scenario manifest references unknown order ${orderId}`,
      );
    }
  }
  for (const orderId of orderIds) {
    if (!declaredOrderIds.has(orderId)) {
      throw new FixtureValidationError(
        `Fixture contains undeclared demo order ${orderId}`,
      );
    }
  }
}

export function validateApprovedDemoData(
  fixtures: unknown,
  scenarios: unknown,
): {
  fixtures: CommerceFixtureSet;
  scenarios: ApprovedScenario[];
} {
  const parsed = validateFixtureShapes(fixtures, scenarios);
  validateFixtureRelationships(parsed.fixtures, parsed.scenarios);
  return parsed;
}
