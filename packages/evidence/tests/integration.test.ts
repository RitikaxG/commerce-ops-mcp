import { expect, test } from "bun:test";
import { createWorkflowRepositoryContext } from "@repo/db";
import { verifyApprovedDemoData } from "@repo/fixtures";
import {
  EVIDENCE_SOURCE_NAMES,
  NormalizedOrderEvidenceSchema,
} from "@repo/schemas";

import { createEvidenceCollector } from "../index.js";

const emptyWorkflowSummary = {
  investigations: 0,
  investigationEvidence: 0,
  humanReviewEscalations: 0,
  idempotencyRecords: 0,
  auditEvents: 0,
};

test("collects approved scenarios through the restricted workflow repository without writes", async () => {
  const context = createWorkflowRepositoryContext();
  const collector = createEvidenceCollector({
    commerce: context.commerce,
    clock: {
      now: () => new Date("2026-07-30T13:00:00.000Z"),
    },
  });

  try {
    const snapshots = await Promise.all(
      [
        "ORD-1042",
        "ORD-1043",
        "ORD-1046",
        "ORD-1047",
        "ORD-1049",
        "ORD-1050",
      ].map((orderId) => collector.collect(orderId)),
    );
    const byOrderId = new Map(
      snapshots.map((snapshot) => [snapshot.orderId, snapshot]),
    );

    for (const snapshot of snapshots) {
      expect(NormalizedOrderEvidenceSchema.parse(snapshot)).toEqual(snapshot);
      expect(snapshot.sourceReads.map(({ source }) => source)).toEqual([
        ...EVIDENCE_SOURCE_NAMES,
      ]);
      expect(snapshot.sourceReads).toHaveLength(8);
      expect(Object.keys(snapshot)).not.toContain("evidenceStatus");
      expect(Object.keys(snapshot)).not.toContain("diagnosis");
    }

    const order1042 = byOrderId.get("ORD-1042");
    expect(order1042?.payment?.status).toBe("SUCCEEDED");
    expect(order1042?.fulfilment?.status).toBe("ON_HOLD");
    expect(order1042?.fulfilment?.assignedWarehouseId).toBe("WH-A");
    expect(
      order1042?.inventoryObservations.map(
        ({ warehouseId, availableQuantity }) =>
          `${warehouseId}=${availableQuantity}`,
      ),
    ).toEqual(["WH-A=0", "WH-B=3"]);
    expect(order1042?.shipment).toBeNull();

    const order1046 = byOrderId.get("ORD-1046");
    expect(order1046?.fulfilment?.assignedWarehouseId).toBe("WH-A");
    expect(order1046?.inventoryObservations).toEqual([]);
    expect(order1046?.sourceReads[6]).toMatchObject({
      source: "INVENTORY",
      status: "SUCCEEDED",
      recordCount: 0,
    });

    const order1050 = byOrderId.get("ORD-1050");
    expect(
      order1050?.inventoryObservations.map(
        ({ sourceSystem, availableQuantity }) =>
          `${sourceSystem}=${availableQuantity}`,
      ),
    ).toEqual(["WAREHOUSE_SYSTEM=0", "COMMERCE_SYSTEM=4"]);

    expect(byOrderId.get("ORD-1043")?.fulfilment).toBeNull();
    expect(
      byOrderId.get("ORD-1043")?.fulfilmentEvents.map(({ type }) => type),
    ).toContain("FULFILMENT_CREATION_FAILED");
    expect(byOrderId.get("ORD-1047")?.shipment).not.toBeNull();
    expect(byOrderId.get("ORD-1049")?.payment?.status).toBe("PROCESSING");
  } finally {
    await context.disconnect();
  }

  const { summary } = await verifyApprovedDemoData();
  expect(summary.workflow).toEqual(emptyWorkflowSummary);
}, 90_000);
