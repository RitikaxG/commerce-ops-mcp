import { describe, expect, test } from "bun:test";

import { approvedOrderIds, approvedScenarioManifest } from "../manifest.js";

const expectedOrderIds = [
  "ORD-1042",
  "ORD-1043",
  "ORD-1044",
  "ORD-1045",
  "ORD-1046",
  "ORD-1047",
  "ORD-1048",
  "ORD-1049",
  "ORD-1050",
];

describe("approved scenario manifest", () => {
  test("contains exactly the nine approved order IDs", () => {
    expect(approvedScenarioManifest).toHaveLength(9);
    expect(approvedOrderIds).toEqual(expectedOrderIds);
    expect(new Set(approvedOrderIds).size).toBe(9);
  });

  test("never claims that commerce state changed", () => {
    expect(
      approvedScenarioManifest.every(
        ({ expectedCommerceStateChanged }) =>
          expectedCommerceStateChanged === false,
      ),
    ).toBeTrue();
  });

  test("keeps ORD-1044 and ORD-1047 non-escalating", () => {
    for (const orderId of ["ORD-1044", "ORD-1047"]) {
      const scenario = approvedScenarioManifest.find(
        (candidate) => candidate.orderId === orderId,
      );
      expect(scenario?.shouldEscalate).toBeFalse();
      expect(scenario?.expectedQueue).toBeNull();
    }
  });

  test("uses the approved escalation and queue contract", () => {
    for (const scenario of approvedScenarioManifest) {
      if (["ORD-1044", "ORD-1047"].includes(scenario.orderId)) {
        continue;
      }
      expect(scenario.shouldEscalate).toBeTrue();
      expect(scenario.expectedQueue).not.toBeNull();
    }
  });

  test("does not assign diagnoses to missing or conflicting evidence", () => {
    for (const orderId of ["ORD-1046", "ORD-1050"]) {
      const scenario = approvedScenarioManifest.find(
        (candidate) => candidate.orderId === orderId,
      );
      expect(scenario?.expectedInvestigationStatus).toBe("NEEDS_MORE_INFO");
      expect(scenario?.expectedDiagnosis).toBeNull();
    }
  });
});
