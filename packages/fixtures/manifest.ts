import { ApprovedScenarioManifestSchema } from "@repo/schemas";

export const approvedScenarioManifest = ApprovedScenarioManifestSchema.parse([
  {
    orderId: "ORD-1042",
    title:
      "Assigned warehouse is out of stock; another warehouse has enough stock",
    expectedEvidenceStatus: "COMPLETE",
    expectedInvestigationStatus: "COMPLETED",
    expectedDiagnosis: "ASSIGNED_WAREHOUSE_OUT_OF_STOCK",
    shouldEscalate: true,
    expectedQueue: "FULFILMENT_OPERATIONS",
    expectedSuggestedNextStep:
      "Review reassignment to an eligible warehouse; do not change commerce state automatically.",
    expectedCommerceStateChanged: false,
  },
  {
    orderId: "ORD-1043",
    title: "Payment succeeded, but fulfilment creation failed",
    expectedEvidenceStatus: "COMPLETE",
    expectedInvestigationStatus: "COMPLETED",
    expectedDiagnosis: "FULFILMENT_CREATION_FAILED",
    shouldEscalate: true,
    expectedQueue: "FULFILMENT_OPERATIONS",
    expectedSuggestedNextStep:
      "Review the confirmed fulfilment creation failure; do not retry fulfilment automatically.",
    expectedCommerceStateChanged: false,
  },
  {
    orderId: "ORD-1044",
    title: "Fulfilment is still within the expected processing window",
    expectedEvidenceStatus: "COMPLETE",
    expectedInvestigationStatus: "COMPLETED",
    expectedDiagnosis: "WITHIN_EXPECTED_PROCESSING_TIME",
    shouldEscalate: false,
    expectedQueue: null,
    expectedSuggestedNextStep:
      "Continue normal monitoring within the expected processing window.",
    expectedCommerceStateChanged: false,
  },
  {
    orderId: "ORD-1045",
    title: "Shipment-label creation failed",
    expectedEvidenceStatus: "COMPLETE",
    expectedInvestigationStatus: "COMPLETED",
    expectedDiagnosis: "SHIPMENT_LABEL_CREATION_FAILED",
    shouldEscalate: true,
    expectedQueue: "SHIPPING_OPERATIONS",
    expectedSuggestedNextStep:
      "Review the shipment-label failure; do not retry or change fulfilment automatically.",
    expectedCommerceStateChanged: false,
  },
  {
    orderId: "ORD-1046",
    title: "Required inventory evidence is missing",
    expectedEvidenceStatus: "MISSING",
    expectedInvestigationStatus: "NEEDS_MORE_INFO",
    expectedDiagnosis: null,
    shouldEscalate: true,
    expectedQueue: "OPERATIONS_DATA_REVIEW",
    expectedSuggestedNextStep:
      "Verify the missing assigned-warehouse inventory evidence.",
    expectedCommerceStateChanged: false,
  },
  {
    orderId: "ORD-1047",
    title: "A shipment already exists",
    expectedEvidenceStatus: "COMPLETE",
    expectedInvestigationStatus: "COMPLETED",
    expectedDiagnosis: "SHIPMENT_ALREADY_EXISTS",
    shouldEscalate: false,
    expectedQueue: null,
    expectedSuggestedNextStep:
      "Verify whether the operator view is stale because a shipment already exists.",
    expectedCommerceStateChanged: false,
  },
  {
    orderId: "ORD-1048",
    title: "Available evidence does not identify a confirmed cause",
    expectedEvidenceStatus: "COMPLETE",
    expectedInvestigationStatus: "COMPLETED",
    expectedDiagnosis: "CAUSE_NOT_DETERMINED",
    shouldEscalate: true,
    expectedQueue: "GENERAL_COMMERCE_OPERATIONS",
    expectedSuggestedNextStep:
      "Review the order manually without inventing a cause.",
    expectedCommerceStateChanged: false,
  },
  {
    orderId: "ORD-1049",
    title:
      "Operator says paid, but the authoritative payment source reports PROCESSING",
    expectedEvidenceStatus: "COMPLETE",
    expectedInvestigationStatus: "COMPLETED",
    expectedDiagnosis: "PAYMENT_NOT_CONFIRMED",
    shouldEscalate: true,
    expectedQueue: "PAYMENT_OPERATIONS",
    expectedSuggestedNextStep:
      "Review the authoritative payment source before treating the order as paid.",
    expectedCommerceStateChanged: false,
  },
  {
    orderId: "ORD-1050",
    title: "Inventory sources report conflicting quantities",
    expectedEvidenceStatus: "CONFLICTING",
    expectedInvestigationStatus: "NEEDS_MORE_INFO",
    expectedDiagnosis: null,
    shouldEscalate: true,
    expectedQueue: "OPERATIONS_DATA_REVIEW",
    expectedSuggestedNextStep:
      "Resolve the conflicting inventory observations before suggesting a warehouse.",
    expectedCommerceStateChanged: false,
  },
]);

export const approvedOrderIds = approvedScenarioManifest.map(
  ({ orderId }) => orderId,
);
