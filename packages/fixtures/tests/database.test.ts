import { expect, test } from "bun:test";
import { readDemoCommerceData, resetDemoData } from "@repo/db";
import type { CommerceFixtureSet } from "@repo/schemas";

import { commerceFixtures } from "../commerce.js";
import {
  resetApprovedDemoData,
  verifyApprovedDemoData,
} from "../persistence.js";

const expectedSummary = {
  commerce: {
    orders: 9,
    orderItems: 9,
    payments: 9,
    warehouses: 2,
    inventoryObservations: 8,
    fulfilments: 7,
    fulfilmentEvents: 14,
    shipments: 1,
  },
  workflow: {
    investigations: 0,
    investigationEvidence: 0,
    humanReviewEscalations: 0,
    idempotencyRecords: 0,
    auditEvents: 0,
  },
};

function canonicalize(fixtures: CommerceFixtureSet): CommerceFixtureSet {
  const sort = <T>(values: readonly T[]): T[] =>
    values
      .map((value) => structuredClone(value))
      .sort((left: T, right: T) =>
        JSON.stringify(left).localeCompare(JSON.stringify(right)),
      );

  return {
    orders: sort(fixtures.orders),
    orderItems: sort(fixtures.orderItems),
    payments: sort(fixtures.payments),
    warehouses: sort(fixtures.warehouses),
    inventoryObservations: sort(fixtures.inventoryObservations),
    fulfilments: sort(fixtures.fulfilments),
    fulfilmentEvents: sort(fixtures.fulfilmentEvents),
    shipments: sort(fixtures.shipments),
  };
}

test("PostgreSQL seed is atomic and reset restores the approved starting state", async () => {
  const initialSummary = await resetApprovedDemoData();
  expect(initialSummary).toEqual(expectedSummary);

  const initialReadBack = await readDemoCommerceData(commerceFixtures);
  expect(canonicalize(initialReadBack)).toEqual(canonicalize(commerceFixtures));

  const forcedFailure = structuredClone(commerceFixtures);
  forcedFailure.payments[1]!.providerReference =
    forcedFailure.payments[0]!.providerReference;

  await expect(resetDemoData(forcedFailure)).rejects.toThrow();

  const afterFailedTransaction = await readDemoCommerceData(commerceFixtures);
  expect(canonicalize(afterFailedTransaction)).toEqual(
    canonicalize(commerceFixtures),
  );

  const modifiedDemo = structuredClone(commerceFixtures);
  const alternativeStock = modifiedDemo.inventoryObservations.find(
    ({ warehouseId, sku }) => warehouseId === "WH-B" && sku === "SKU-1042",
  );
  expect(alternativeStock).toBeDefined();
  alternativeStock!.availableQuantity = 99;
  await resetDemoData(modifiedDemo);

  const restoredSummary = await resetApprovedDemoData();
  expect(restoredSummary).toEqual(expectedSummary);

  const { fixtures, summary } = await verifyApprovedDemoData();
  expect(summary).toEqual(expectedSummary);
  expect(canonicalize(fixtures)).toEqual(canonicalize(commerceFixtures));
}, 90_000);
