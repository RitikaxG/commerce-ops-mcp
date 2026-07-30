import type { CommerceReadRepository } from "@repo/db";
import {
  NormalizedOrderEvidenceSchema,
  type CommerceFulfilmentEventRecord,
  type CommerceFulfilmentRecord,
  type CommerceInventoryObservationRecord,
  type CommerceOrderItemRecord,
  type CommerceOrderRecord,
  type CommercePaymentRecord,
  type CommerceShipmentRecord,
  type CommerceWarehouseRecord,
  type EvidenceSourceName,
  type EvidenceSourceRead,
  type EvidenceSourceReadErrorCode,
  type NormalizedOrderEvidence,
} from "@repo/schemas";

export interface EvidenceClock {
  now(): Date;
}

export interface EvidenceCollector {
  collect(orderId: string): Promise<NormalizedOrderEvidence>;
}

interface SourceOutcome<T> {
  value: T;
  read: EvidenceSourceRead;
}

const systemClock: EvidenceClock = {
  now: () => new Date(),
};

function timestamp(clock: EvidenceClock): string {
  return clock.now().toISOString();
}

function latestTimestamp(values: readonly string[]): string | null {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((latest, value) =>
    Date.parse(value) > Date.parse(latest) ? value : latest,
  );
}

function successfulRead(
  source: EvidenceSourceName,
  readAt: string,
  latestSourceTimestamp: string | null,
  recordCount: number,
): EvidenceSourceRead {
  return {
    source,
    status: "SUCCEEDED",
    readAt,
    latestSourceTimestamp,
    recordCount,
    errorCode: null,
  };
}

function unavailableRead(
  source: EvidenceSourceName,
  status: "FAILED" | "SKIPPED",
  readAt: string,
  errorCode: EvidenceSourceReadErrorCode,
): EvidenceSourceRead {
  return {
    source,
    status,
    readAt,
    latestSourceTimestamp: null,
    recordCount: 0,
    errorCode,
  };
}

async function collectSource<T>(input: {
  source: EvidenceSourceName;
  readAt: string;
  operation: () => Promise<T>;
  fallback: T;
  recordCount: (value: T) => number;
  latestSourceTimestamp: (value: T) => string | null;
}): Promise<SourceOutcome<T>> {
  try {
    const value = await input.operation();
    return {
      value,
      read: successfulRead(
        input.source,
        input.readAt,
        input.latestSourceTimestamp(value),
        input.recordCount(value),
      ),
    };
  } catch {
    return {
      value: input.fallback,
      read: unavailableRead(
        input.source,
        "FAILED",
        input.readAt,
        "SOURCE_READ_FAILED",
      ),
    };
  }
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right);
}

function normalizeOrderItems(
  items: readonly CommerceOrderItemRecord[],
): CommerceOrderItemRecord[] {
  return [...items].sort(
    (left, right) =>
      compareText(left.sku, right.sku) || compareText(left.id, right.id),
  );
}

function normalizeFulfilmentEvents(
  events: readonly CommerceFulfilmentEventRecord[],
): CommerceFulfilmentEventRecord[] {
  return [...events].sort(
    (left, right) =>
      compareText(left.occurredAt, right.occurredAt) ||
      compareText(left.id, right.id),
  );
}

const inventorySourceOrder = {
  WAREHOUSE_SYSTEM: 0,
  COMMERCE_SYSTEM: 1,
} as const;

function normalizeInventory(
  observations: readonly CommerceInventoryObservationRecord[],
): CommerceInventoryObservationRecord[] {
  return [...observations].sort(
    (left, right) =>
      compareText(left.warehouseId, right.warehouseId) ||
      compareText(left.sku, right.sku) ||
      inventorySourceOrder[left.sourceSystem] -
        inventorySourceOrder[right.sourceSystem],
  );
}

function normalizeWarehouses(
  warehouses: readonly CommerceWarehouseRecord[],
): CommerceWarehouseRecord[] {
  return [...warehouses].sort((left, right) => compareText(left.id, right.id));
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareText);
}

class DefaultEvidenceCollector implements EvidenceCollector {
  constructor(
    private readonly commerce: CommerceReadRepository,
    private readonly clock: EvidenceClock,
  ) {}

  async collect(orderId: string): Promise<NormalizedOrderEvidence> {
    const collectedAt = timestamp(this.clock);

    const [
      orderOutcome,
      orderItemsOutcome,
      paymentOutcome,
      fulfilmentOutcome,
      fulfilmentEventsOutcome,
      shipmentOutcome,
    ] = await Promise.all([
      collectSource<CommerceOrderRecord | null>({
        source: "ORDER",
        readAt: timestamp(this.clock),
        operation: () => this.commerce.findOrderById(orderId),
        fallback: null,
        recordCount: (order) => (order === null ? 0 : 1),
        latestSourceTimestamp: (order) => order?.updatedAt ?? null,
      }),
      collectSource<CommerceOrderItemRecord[]>({
        source: "ORDER_ITEMS",
        readAt: timestamp(this.clock),
        operation: async () =>
          normalizeOrderItems(
            await this.commerce.listOrderItemsForOrder(orderId),
          ),
        fallback: [],
        recordCount: (items) => items.length,
        latestSourceTimestamp: (items) =>
          latestTimestamp(items.map(({ createdAt }) => createdAt)),
      }),
      collectSource<CommercePaymentRecord | null>({
        source: "PAYMENT",
        readAt: timestamp(this.clock),
        operation: () => this.commerce.findCurrentPaymentForOrder(orderId),
        fallback: null,
        recordCount: (payment) => (payment === null ? 0 : 1),
        latestSourceTimestamp: (payment) => payment?.observedAt ?? null,
      }),
      collectSource<CommerceFulfilmentRecord | null>({
        source: "FULFILMENT",
        readAt: timestamp(this.clock),
        operation: () => this.commerce.findCurrentFulfilmentForOrder(orderId),
        fallback: null,
        recordCount: (fulfilment) => (fulfilment === null ? 0 : 1),
        latestSourceTimestamp: (fulfilment) => fulfilment?.observedAt ?? null,
      }),
      collectSource<CommerceFulfilmentEventRecord[]>({
        source: "FULFILMENT_EVENTS",
        readAt: timestamp(this.clock),
        operation: async () =>
          normalizeFulfilmentEvents(
            await this.commerce.listFulfilmentEventsForOrder(orderId),
          ),
        fallback: [],
        recordCount: (events) => events.length,
        latestSourceTimestamp: (events) =>
          latestTimestamp(events.map(({ occurredAt }) => occurredAt)),
      }),
      collectSource<CommerceShipmentRecord | null>({
        source: "SHIPMENT",
        readAt: timestamp(this.clock),
        operation: () => this.commerce.findCurrentShipmentForOrder(orderId),
        fallback: null,
        recordCount: (shipment) => (shipment === null ? 0 : 1),
        latestSourceTimestamp: (shipment) => shipment?.observedAt ?? null,
      }),
    ]);

    const inventoryOutcome =
      orderItemsOutcome.read.status === "SUCCEEDED"
        ? await collectSource<CommerceInventoryObservationRecord[]>({
            source: "INVENTORY",
            readAt: timestamp(this.clock),
            operation: async () =>
              normalizeInventory(
                await this.commerce.listInventoryObservationsForSkus(
                  uniqueSorted(orderItemsOutcome.value.map(({ sku }) => sku)),
                ),
              ),
            fallback: [],
            recordCount: (observations) => observations.length,
            latestSourceTimestamp: (observations) =>
              latestTimestamp(observations.map(({ observedAt }) => observedAt)),
          })
        : {
            value: [],
            read: unavailableRead(
              "INVENTORY",
              "SKIPPED",
              timestamp(this.clock),
              "ORDER_ITEMS_UNAVAILABLE",
            ),
          };

    const warehouseDependenciesAvailable =
      fulfilmentOutcome.read.status === "SUCCEEDED" &&
      inventoryOutcome.read.status === "SUCCEEDED";

    const warehouseOutcome: SourceOutcome<CommerceWarehouseRecord[]> =
      warehouseDependenciesAvailable
        ? await collectSource<CommerceWarehouseRecord[]>({
            source: "WAREHOUSES",
            readAt: timestamp(this.clock),
            operation: async () =>
              normalizeWarehouses(
                await this.commerce.listWarehousesByIds(
                  uniqueSorted([
                    ...(fulfilmentOutcome.value?.assignedWarehouseId
                      ? [fulfilmentOutcome.value.assignedWarehouseId]
                      : []),
                    ...inventoryOutcome.value.map(
                      ({ warehouseId }) => warehouseId,
                    ),
                  ]),
                ),
              ),
            fallback: [],
            recordCount: (warehouses) => warehouses.length,
            latestSourceTimestamp: (warehouses) =>
              latestTimestamp(warehouses.map(({ createdAt }) => createdAt)),
          })
        : {
            value: [],
            read: unavailableRead(
              "WAREHOUSES",
              "SKIPPED",
              timestamp(this.clock),
              "WAREHOUSE_IDS_UNAVAILABLE",
            ),
          };

    return NormalizedOrderEvidenceSchema.parse({
      schemaVersion: 1,
      orderId,
      collectedAt,
      order: orderOutcome.value,
      orderItems: orderItemsOutcome.value,
      payment: paymentOutcome.value,
      fulfilment: fulfilmentOutcome.value,
      fulfilmentEvents: fulfilmentEventsOutcome.value,
      shipment: shipmentOutcome.value,
      inventoryObservations: inventoryOutcome.value,
      warehouses: warehouseOutcome.value,
      sourceReads: [
        orderOutcome.read,
        orderItemsOutcome.read,
        paymentOutcome.read,
        fulfilmentOutcome.read,
        fulfilmentEventsOutcome.read,
        shipmentOutcome.read,
        inventoryOutcome.read,
        warehouseOutcome.read,
      ],
    });
  }
}

export function createEvidenceCollector(input: {
  commerce: CommerceReadRepository;
  clock?: EvidenceClock;
}): EvidenceCollector {
  return new DefaultEvidenceCollector(
    input.commerce,
    input.clock ?? systemClock,
  );
}
