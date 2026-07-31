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
  value.authoritativeWarehouseIds = ["WH-A", "WH-B"];
  return value;
}

describe("grounding validation", () => {
  test("accepts an explanation while the host owns the authoritative next step", () => {
    expect(
      validateGroundedExplanation(
        {
          summary: "ORD-1042 has an inventory hold at WH-A.",
          reason: "WH-B is the only eligible alternative in the MCP result.",
          nextStep: null,
        },
        state(),
      ),
    ).toEqual([]);
  });

  test("rejects model-supplied next steps and invented facts", () => {
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
          nextStep: null,
        },
        state(),
      ),
    ).toContain("SECRET_LIKE_CONTENT");
  });

  test("requires uncertainty language when evidence is missing", () => {
    const missing = createEmptyAuthoritativeState();
    missing.orderId = "ORD-1046";
    missing.investigationId = "INV-1046";
    missing.evidenceStatus = "MISSING";
    missing.shouldEscalate = true;
    missing.suggestedQueue = "OPERATIONS_DATA_REVIEW";
    missing.suggestedNextStep =
      "Verify the missing assigned-warehouse inventory evidence.";
    missing.authoritativeWarehouseIds = ["WH-A"];

    expect(
      validateGroundedExplanation(
        {
          summary: "The assigned warehouse is out of stock.",
          reason: "The confirmed cause should be sent to payment operations.",
          nextStep: null,
        },
        missing,
      ),
    ).toEqual(
      expect.arrayContaining(["UNSUPPORTED_DIAGNOSIS", "UNSUPPORTED_QUEUE"]),
    );

    expect(
      validateGroundedExplanation(
        {
          summary:
            "Inventory evidence for the assigned warehouse WH-A is missing, so no cause can be confirmed.",
          reason:
            "The investigation needs more information before a diagnosis is possible.",
          nextStep: null,
        },
        missing,
      ),
    ).toEqual([]);
  });

  test("does not allow conflicting evidence to become a confirmed cause", () => {
    const conflicting = createEmptyAuthoritativeState();
    conflicting.orderId = "ORD-1050";
    conflicting.investigationId = "INV-1050";
    conflicting.evidenceStatus = "CONFLICTING";
    conflicting.shouldEscalate = true;
    conflicting.suggestedQueue = "OPERATIONS_DATA_REVIEW";
    conflicting.suggestedNextStep =
      "Resolve the conflicting inventory observations before suggesting a warehouse.";
    conflicting.authoritativeWarehouseIds = ["WH-A"];

    expect(
      validateGroundedExplanation(
        {
          summary: "Shipment-label creation failed.",
          reason: "The cause is confirmed despite the source conflict.",
          nextStep: null,
        },
        conflicting,
      ),
    ).toContain("UNSUPPORTED_DIAGNOSIS");
  });
});
