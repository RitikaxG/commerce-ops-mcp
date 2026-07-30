import {
  CommerceFixtureSetSchema,
  type CommerceFixtureSet,
} from "@repo/schemas";

import { createDatabaseClient } from "./client.js";
import { Prisma, type PrismaClient } from "./generated/prisma/client.js";

type DatabaseTransaction = Prisma.TransactionClient;

export interface DemoDataSummary {
  commerce: {
    orders: number;
    orderItems: number;
    payments: number;
    warehouses: number;
    inventoryObservations: number;
    fulfilments: number;
    fulfilmentEvents: number;
    shipments: number;
  };
  workflow: {
    investigations: number;
    investigationEvidence: number;
    humanReviewEscalations: number;
    idempotencyRecords: number;
    auditEvents: number;
  };
}

function date(value: string): Date {
  return new Date(value);
}

async function insertCommerceFixtures(
  transaction: DatabaseTransaction,
  fixtures: CommerceFixtureSet,
): Promise<void> {
  await transaction.warehouse.createMany({
    data: fixtures.warehouses.map((warehouse) => ({
      ...warehouse,
      createdAt: date(warehouse.createdAt),
    })),
  });
  await transaction.order.createMany({
    data: fixtures.orders.map((order) => ({
      ...order,
      createdAt: date(order.createdAt),
      updatedAt: date(order.updatedAt),
    })),
  });
  await transaction.orderItem.createMany({
    data: fixtures.orderItems.map((item) => ({
      ...item,
      createdAt: date(item.createdAt),
    })),
  });
  await transaction.payment.createMany({
    data: fixtures.payments.map((payment) => ({
      ...payment,
      observedAt: date(payment.observedAt),
    })),
  });
  await transaction.inventoryObservation.createMany({
    data: fixtures.inventoryObservations.map((observation) => ({
      ...observation,
      observedAt: date(observation.observedAt),
    })),
  });
  await transaction.fulfilment.createMany({
    data: fixtures.fulfilments.map((fulfilment) => ({
      ...fulfilment,
      createdAt: date(fulfilment.createdAt),
      updatedAt: date(fulfilment.updatedAt),
      observedAt: date(fulfilment.observedAt),
    })),
  });
  await transaction.fulfilmentEvent.createMany({
    data: fixtures.fulfilmentEvents.map((event) => ({
      ...event,
      details: event.details as Prisma.InputJsonValue,
      occurredAt: date(event.occurredAt),
    })),
  });
  await transaction.shipment.createMany({
    data: fixtures.shipments.map((shipment) => ({
      ...shipment,
      createdAt: date(shipment.createdAt),
      observedAt: date(shipment.observedAt),
    })),
  });
}

async function removeApprovedDemoData(
  transaction: DatabaseTransaction,
  fixtures: CommerceFixtureSet,
): Promise<void> {
  const orderIds = fixtures.orders.map(({ id }) => id);
  const investigationRows = await transaction.investigation.findMany({
    where: { orderId: { in: orderIds } },
    select: { id: true },
  });
  const investigationIds = investigationRows.map(({ id }) => id);
  const escalationRows =
    investigationIds.length === 0
      ? []
      : await transaction.humanReviewEscalation.findMany({
          where: { investigationId: { in: investigationIds } },
          select: { id: true },
        });
  const escalationIds = escalationRows.map(({ id }) => id);
  const workflowResourceIds = [...investigationIds, ...escalationIds];

  if (investigationIds.length > 0 || escalationIds.length > 0) {
    await transaction.auditEvent.deleteMany({
      where: {
        OR: [
          { investigationId: { in: investigationIds } },
          { escalationId: { in: escalationIds } },
        ],
      },
    });
  }
  if (workflowResourceIds.length > 0) {
    await transaction.idempotencyRecord.deleteMany({
      where: { resourceId: { in: workflowResourceIds } },
    });
  }
  if (investigationIds.length > 0) {
    await transaction.investigationEvidence.deleteMany({
      where: { investigationId: { in: investigationIds } },
    });
    await transaction.humanReviewEscalation.deleteMany({
      where: { investigationId: { in: investigationIds } },
    });
    await transaction.investigation.deleteMany({
      where: { id: { in: investigationIds } },
    });
  }

  await transaction.shipment.deleteMany({
    where: { orderId: { in: orderIds } },
  });
  await transaction.fulfilmentEvent.deleteMany({
    where: { orderId: { in: orderIds } },
  });
  await transaction.fulfilment.deleteMany({
    where: { orderId: { in: orderIds } },
  });
  await transaction.payment.deleteMany({
    where: { orderId: { in: orderIds } },
  });
  await transaction.orderItem.deleteMany({
    where: { orderId: { in: orderIds } },
  });
  await transaction.inventoryObservation.deleteMany({
    where: {
      OR: fixtures.inventoryObservations.map(
        ({ warehouseId, sku, sourceSystem }) => ({
          warehouseId,
          sku,
          sourceSystem,
        }),
      ),
    },
  });
  await transaction.order.deleteMany({
    where: { id: { in: orderIds } },
  });
  await transaction.warehouse.deleteMany({
    where: { id: { in: fixtures.warehouses.map(({ id }) => id) } },
  });
}

export async function seedDemoData(
  input: CommerceFixtureSet,
): Promise<DemoDataSummary> {
  const fixtures = CommerceFixtureSetSchema.parse(input);
  const database = createDatabaseClient();

  try {
    await database.$transaction((transaction) =>
      insertCommerceFixtures(transaction, fixtures),
    );
    return await getDemoDataSummaryWithClient(database, fixtures);
  } finally {
    await database.$disconnect();
  }
}

export async function resetDemoData(
  input: CommerceFixtureSet,
): Promise<DemoDataSummary> {
  const fixtures = CommerceFixtureSetSchema.parse(input);
  const database = createDatabaseClient();

  try {
    await database.$transaction(async (transaction) => {
      await removeApprovedDemoData(transaction, fixtures);
      await insertCommerceFixtures(transaction, fixtures);
    });
    return await getDemoDataSummaryWithClient(database, fixtures);
  } finally {
    await database.$disconnect();
  }
}

async function getDemoDataSummaryWithClient(
  database: PrismaClient,
  fixtures: CommerceFixtureSet,
): Promise<DemoDataSummary> {
  const orderIds = fixtures.orders.map(({ id }) => id);
  const warehouseIds = fixtures.warehouses.map(({ id }) => id);
  const investigationRows = await database.investigation.findMany({
    where: { orderId: { in: orderIds } },
    select: { id: true },
  });
  const investigationIds = investigationRows.map(({ id }) => id);
  const escalationRows =
    investigationIds.length === 0
      ? []
      : await database.humanReviewEscalation.findMany({
          where: { investigationId: { in: investigationIds } },
          select: { id: true },
        });
  const escalationIds = escalationRows.map(({ id }) => id);
  const workflowResourceIds = [...investigationIds, ...escalationIds];

  const [
    orders,
    orderItems,
    payments,
    warehouses,
    inventoryObservations,
    fulfilments,
    fulfilmentEvents,
    shipments,
    investigationEvidence,
    idempotencyRecords,
    auditEvents,
  ] = await Promise.all([
    database.order.count({ where: { id: { in: orderIds } } }),
    database.orderItem.count({ where: { orderId: { in: orderIds } } }),
    database.payment.count({ where: { orderId: { in: orderIds } } }),
    database.warehouse.count({ where: { id: { in: warehouseIds } } }),
    database.inventoryObservation.count({
      where: {
        OR: fixtures.inventoryObservations.map(
          ({ warehouseId, sku, sourceSystem }) => ({
            warehouseId,
            sku,
            sourceSystem,
          }),
        ),
      },
    }),
    database.fulfilment.count({ where: { orderId: { in: orderIds } } }),
    database.fulfilmentEvent.count({
      where: { orderId: { in: orderIds } },
    }),
    database.shipment.count({ where: { orderId: { in: orderIds } } }),
    investigationIds.length === 0
      ? 0
      : database.investigationEvidence.count({
          where: { investigationId: { in: investigationIds } },
        }),
    workflowResourceIds.length === 0
      ? 0
      : database.idempotencyRecord.count({
          where: { resourceId: { in: workflowResourceIds } },
        }),
    investigationIds.length === 0 && escalationIds.length === 0
      ? 0
      : database.auditEvent.count({
          where: {
            OR: [
              { investigationId: { in: investigationIds } },
              { escalationId: { in: escalationIds } },
            ],
          },
        }),
  ]);

  return {
    commerce: {
      orders,
      orderItems,
      payments,
      warehouses,
      inventoryObservations,
      fulfilments,
      fulfilmentEvents,
      shipments,
    },
    workflow: {
      investigations: investigationIds.length,
      investigationEvidence,
      humanReviewEscalations: escalationIds.length,
      idempotencyRecords,
      auditEvents,
    },
  };
}

export async function getDemoDataSummary(
  input: CommerceFixtureSet,
): Promise<DemoDataSummary> {
  const fixtures = CommerceFixtureSetSchema.parse(input);
  const database = createDatabaseClient();

  try {
    return await getDemoDataSummaryWithClient(database, fixtures);
  } finally {
    await database.$disconnect();
  }
}

export async function readDemoCommerceData(
  input: CommerceFixtureSet,
): Promise<CommerceFixtureSet> {
  const fixtures = CommerceFixtureSetSchema.parse(input);
  const orderIds = fixtures.orders.map(({ id }) => id);
  const database = createDatabaseClient();

  try {
    const [
      orders,
      orderItems,
      payments,
      warehouses,
      inventoryObservations,
      fulfilments,
      fulfilmentEvents,
      shipments,
    ] = await Promise.all([
      database.order.findMany({ where: { id: { in: orderIds } } }),
      database.orderItem.findMany({ where: { orderId: { in: orderIds } } }),
      database.payment.findMany({ where: { orderId: { in: orderIds } } }),
      database.warehouse.findMany({
        where: { id: { in: fixtures.warehouses.map(({ id }) => id) } },
      }),
      database.inventoryObservation.findMany({
        where: {
          OR: fixtures.inventoryObservations.map(
            ({ warehouseId, sku, sourceSystem }) => ({
              warehouseId,
              sku,
              sourceSystem,
            }),
          ),
        },
      }),
      database.fulfilment.findMany({ where: { orderId: { in: orderIds } } }),
      database.fulfilmentEvent.findMany({
        where: { orderId: { in: orderIds } },
      }),
      database.shipment.findMany({ where: { orderId: { in: orderIds } } }),
    ]);

    return CommerceFixtureSetSchema.parse({
      orders: orders.map((order) => ({
        ...order,
        createdAt: order.createdAt.toISOString(),
        updatedAt: order.updatedAt.toISOString(),
      })),
      orderItems: orderItems.map((item) => ({
        ...item,
        createdAt: item.createdAt.toISOString(),
      })),
      payments: payments.map((payment) => ({
        ...payment,
        amount: payment.amount.toFixed(2),
        observedAt: payment.observedAt.toISOString(),
      })),
      warehouses: warehouses.map((warehouse) => ({
        ...warehouse,
        createdAt: warehouse.createdAt.toISOString(),
      })),
      inventoryObservations: inventoryObservations.map((observation) => ({
        ...observation,
        observedAt: observation.observedAt.toISOString(),
      })),
      fulfilments: fulfilments.map((fulfilment) => ({
        ...fulfilment,
        createdAt: fulfilment.createdAt.toISOString(),
        updatedAt: fulfilment.updatedAt.toISOString(),
        observedAt: fulfilment.observedAt.toISOString(),
      })),
      fulfilmentEvents: fulfilmentEvents.map((event) => ({
        ...event,
        details: event.details,
        occurredAt: event.occurredAt.toISOString(),
      })),
      shipments: shipments.map((shipment) => ({
        ...shipment,
        createdAt: shipment.createdAt.toISOString(),
        observedAt: shipment.observedAt.toISOString(),
      })),
    });
  } finally {
    await database.$disconnect();
  }
}
