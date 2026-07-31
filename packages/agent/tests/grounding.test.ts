import { describe, expect, test } from "bun:test";

import {
  createEmptyAuthoritativeState,
  validateGroundedExplanation,
} from "../index.js";

const NEXT_STEP =
  "Review reassignment to an eligible warehouse; do not change commerce state automatically.";

function state() {
  const value = createEmptyAuthoritativeState();
  value.orderId = "ORD-1042";
  value.investigationId = "INV-1042";
  value.evidenceStatus = "COMPLETE";
  value.diagnosisCode = "ASSIGNED_WAREHOUSE_OUT_OF_STOCK";
  value.shouldEscalate = true;
  value.suggestedQueue = "FULFILMENT_OPERATIONS";
  value.suggestedNextStep = NEXT_STEP;
  value.eligibleAlternativeWarehouseIds = ["WH-B"];
  return value;
}

describe("grounding validation", () => {
  test("accepts an explanation grounded in the authoritative result", () => {
    expect(
      validateGroundedExplanation(
        {
          summary: "ORD-1042 has an inventory hold.",
          reason: "WH-B is the only eligible alternative in the MCP result.",
          nextStep: NEXT_STEP,
        },
        state(),
      ),
    ).toEqual([]);
  });

  test("rejects mismatched next steps and invented facts", () => {
    expect(
      validateGroundedExplanation(
        {
          summary: "CASE-FAKE was created in PAYMENT_OPERATIONS.",
          reason: "WH-C can be used and the order was successfully reassigned.",
          nextStep: "Retry the shipment.",
        },
        state(),
      ),
    ).toEqual(
      expect.arrayContaining([
        "NEXT_STEP_MISMATCH",
        "UNSUPPORTED_QUEUE",
        "INVENTED_IDENTIFIER",
        "INVENTED_WAREHOUSE",
        "FALSE_STATE_CHANGE",
        "FALSE_REVIEW_CASE_CLAIM",
      ]),
    );
  });

  test("rejects secret-like output", () => {
    expect(
      validateGroundedExplanation(
        {
          summary: "A secret-like value was returned.",
          reason: "AIza123456789012345678901234567890",
          nextStep: NEXT_STEP,
        },
        state(),
      ),
    ).toContain("SECRET_LIKE_CONTENT");
  });
});
