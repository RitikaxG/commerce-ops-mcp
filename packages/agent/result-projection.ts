import {
  APPROVED_AGENT_TOOL_NAMES,
  DiagnosisCodeSchema,
  ReviewQueueSchema,
  type DiagnosisCode,
  type EvidenceStatus,
  type GroundingIssueCode,
  type ModelExplanation,
  type ReviewQueue,
} from "@repo/schemas";

import type { JsonObject } from "./provider.js";

export interface AuthoritativeAgentState {
  orderId: string | null;
  investigationId: string | null;
  reviewCaseId: string | null;
  evidenceStatus: EvidenceStatus | null;
  diagnosisCode: DiagnosisCode | null;
  shouldEscalate: boolean | null;
  suggestedQueue: ReviewQueue | null;
  suggestedNextStep: string | null;
  eligibleAlternativeWarehouseIds: string[];
  authoritativeWarehouseIds: string[];
}

export function createEmptyAuthoritativeState(): AuthoritativeAgentState {
  const state = {
    orderId: null,
    investigationId: null,
    reviewCaseId: null,
    evidenceStatus: null,
    diagnosisCode: null,
    shouldEscalate: null,
    suggestedQueue: null,
    suggestedNextStep: null,
    eligibleAlternativeWarehouseIds: [],
  } as AuthoritativeAgentState;

  Object.defineProperty(state, "authoritativeWarehouseIds", {
    value: [],
    writable: true,
    enumerable: false,
  });
  return state;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(
  record: Record<string, unknown>,
  key: string,
): string | null {
  return typeof record[key] === "string" ? record[key] : null;
}

const WAREHOUSE_PATTERN = /\bWH-[A-Za-z0-9-]+\b/g;

function collectWarehouseIds(
  value: unknown,
  target = new Set<string>(),
): Set<string> {
  if (typeof value === "string") {
    for (const warehouseId of value.match(WAREHOUSE_PATTERN) ?? []) {
      target.add(warehouseId);
    }
    return target;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectWarehouseIds(item, target);
    }
    return target;
  }
  if (isRecord(value)) {
    for (const item of Object.values(value)) {
      collectWarehouseIds(item, target);
    }
  }
  return target;
}

function recordAuthoritativeWarehouseIds(
  state: AuthoritativeAgentState,
  projection: JsonObject,
): JsonObject {
  state.authoritativeWarehouseIds = [
    ...new Set([
      ...state.authoritativeWarehouseIds,
      ...collectWarehouseIds(projection),
    ]),
  ].sort();
  return projection;
}

export function isSuccessfulMcpOutput(
  value: unknown,
): value is { ok: true; result: Record<string, unknown> } {
  return isRecord(value) && value.ok === true && isRecord(value.result);
}

export function safeMcpFailureMessage(value: unknown): string {
  if (!isRecord(value) || value.ok !== false || !isRecord(value.error)) {
    return "The MCP tool could not complete safely.";
  }
  return typeof value.error.message === "string"
    ? value.error.message
    : "The MCP tool could not complete safely.";
}

export function projectMcpResult(
  toolName: string,
  output: unknown,
  state: AuthoritativeAgentState,
): JsonObject {
  if (!isSuccessfulMcpOutput(output)) {
    return {
      ok: false,
      message: safeMcpFailureMessage(output),
      commerceStateChanged: false,
    };
  }
  const result = output.result;

  if (toolName === "investigate_order_exception") {
    const decision = isRecord(result.decision) ? result.decision : {};
    state.orderId = stringValue(result, "orderId");
    state.investigationId = stringValue(result, "investigationId");
    state.evidenceStatus = stringValue(
      decision,
      "evidenceStatus",
    ) as EvidenceStatus | null;
    state.diagnosisCode = stringValue(
      decision,
      "diagnosisCode",
    ) as DiagnosisCode | null;
    state.shouldEscalate =
      typeof decision.shouldEscalate === "boolean"
        ? decision.shouldEscalate
        : null;
    state.suggestedQueue = stringValue(
      decision,
      "suggestedQueue",
    ) as ReviewQueue | null;
    state.suggestedNextStep = stringValue(decision, "suggestedNextStep");
    state.eligibleAlternativeWarehouseIds = Array.isArray(
      decision.eligibleAlternativeWarehouseIds,
    )
      ? decision.eligibleAlternativeWarehouseIds.filter(
          (value): value is string => typeof value === "string",
        )
      : [];
    return recordAuthoritativeWarehouseIds(state, {
      orderId: state.orderId,
      investigationId: state.investigationId,
      investigationStatus: result.status ?? null,
      evidenceStatus: state.evidenceStatus,
      diagnosisCode: state.diagnosisCode,
      matchedRule: decision.matchedRule ?? null,
      supportingFacts: Array.isArray(decision.supportingFacts)
        ? decision.supportingFacts
        : [],
      shouldEscalate: state.shouldEscalate,
      suggestedQueue: state.suggestedQueue,
      suggestedNextStep: state.suggestedNextStep,
      eligibleAlternativeWarehouseIds: state.eligibleAlternativeWarehouseIds,
      commerceStateChanged: false,
    });
  }

  if (toolName === "create_human_review_escalation") {
    state.reviewCaseId = stringValue(result, "reviewCaseId");
    state.investigationId =
      stringValue(result, "investigationId") ?? state.investigationId;
    state.orderId = stringValue(result, "orderId") ?? state.orderId;
    state.suggestedQueue =
      (stringValue(result, "queue") as ReviewQueue | null) ??
      state.suggestedQueue;
    state.suggestedNextStep =
      stringValue(result, "suggestedNextStep") ?? state.suggestedNextStep;
    return recordAuthoritativeWarehouseIds(state, {
      reviewCaseId: state.reviewCaseId,
      investigationId: state.investigationId,
      orderId: state.orderId,
      disposition: result.disposition ?? null,
      queue: state.suggestedQueue,
      reasonCode: result.reasonCode ?? null,
      suggestedNextStep: state.suggestedNextStep,
      commerceStateChanged: false,
    });
  }

  if (toolName === "list_demo_cases") {
    return recordAuthoritativeWarehouseIds(state, {
      purpose: result.purpose ?? null,
      cases: Array.isArray(result.cases) ? result.cases : [],
      commerceStateChanged: false,
    });
  }

  if (toolName === "get_review_case") {
    const reviewCase = isRecord(result.reviewCase) ? result.reviewCase : {};
    const investigation = isRecord(result.investigation)
      ? result.investigation
      : {};
    state.reviewCaseId = stringValue(reviewCase, "reviewCaseId");
    state.investigationId = stringValue(reviewCase, "investigationId");
    state.orderId = stringValue(reviewCase, "orderId");
    state.evidenceStatus = stringValue(
      investigation,
      "evidenceStatus",
    ) as EvidenceStatus | null;
    state.diagnosisCode = stringValue(
      investigation,
      "diagnosisCode",
    ) as DiagnosisCode | null;
    state.suggestedQueue = stringValue(
      reviewCase,
      "queue",
    ) as ReviewQueue | null;
    state.suggestedNextStep = stringValue(reviewCase, "suggestedNextStep");
    return recordAuthoritativeWarehouseIds(state, {
      reviewCaseId: state.reviewCaseId,
      investigationId: state.investigationId,
      orderId: state.orderId,
      status: reviewCase.status ?? null,
      queue: state.suggestedQueue,
      reasonCode: reviewCase.reasonCode ?? null,
      suggestedNextStep: state.suggestedNextStep,
      diagnosisCode: state.diagnosisCode,
      commerceStateChanged: false,
    });
  }

  const investigation = isRecord(result.investigation)
    ? result.investigation
    : {};
  state.investigationId = stringValue(investigation, "investigationId");
  state.orderId = stringValue(investigation, "orderId");
  state.evidenceStatus = stringValue(
    investigation,
    "evidenceStatus",
  ) as EvidenceStatus | null;
  state.diagnosisCode = stringValue(
    investigation,
    "diagnosisCode",
  ) as DiagnosisCode | null;
  state.suggestedQueue = stringValue(
    investigation,
    "suggestedQueue",
  ) as ReviewQueue | null;
  state.suggestedNextStep = stringValue(investigation, "suggestedNextStep");
  return recordAuthoritativeWarehouseIds(state, {
    investigationId: state.investigationId,
    orderId: state.orderId,
    status: investigation.status ?? null,
    evidenceStatus: state.evidenceStatus,
    diagnosisCode: state.diagnosisCode,
    suggestedQueue: state.suggestedQueue,
    suggestedNextStep: state.suggestedNextStep,
    auditEventCount: Array.isArray(result.auditEvents)
      ? result.auditEvents.length
      : 0,
    commerceStateChanged: false,
  });
}

const FALSE_CHANGE =
  /\b(was|has been|successfully|is now)\s+(reassigned|released|retried|updated|created|shipped|fixed|reserved)\b/i;
const FALSE_REVIEW_CASE =
  /\b(?:(?:review case|human-review case)|(?:CASE|ESC)-[A-Za-z0-9-]+)\s+(?:was|has been|is)\s+(?:created|opened)\b/i;
const SECRET_LIKE = /\b(?:AIza|AQ\.)[A-Za-z0-9_-]{20,}\b/;
const IDENTIFIER_PATTERN = /\b(?:ORD|INV|CASE|ESC)-[A-Za-z0-9-]+\b/g;
const UNCERTAINTY_LANGUAGE =
  /\b(missing|conflicting|conflict|insufficient|not enough|cannot determine|could not determine|needs more information|verify the evidence|verify the missing|resolve the conflicting)\b/i;

const DIAGNOSIS_LANGUAGE: Record<DiagnosisCode, RegExp> = {
  ASSIGNED_WAREHOUSE_OUT_OF_STOCK:
    /\b(assigned warehouse is out of stock|assigned warehouse lacks (?:the )?required stock|inventory hold because .*out of stock)\b/i,
  FULFILMENT_CREATION_FAILED:
    /\b(fulfilment creation failed|failed to create (?:the )?fulfilment)\b/i,
  WITHIN_EXPECTED_PROCESSING_TIME:
    /\b(within (?:the )?expected processing (?:time|window)|normal processing window)\b/i,
  SHIPMENT_LABEL_CREATION_FAILED:
    /\b(shipment[- ]label creation failed|failed to create (?:the )?shipment label)\b/i,
  SHIPMENT_ALREADY_EXISTS:
    /\b(shipment already exists|a shipment has already been created)\b/i,
  PAYMENT_NOT_CONFIRMED:
    /\b(payment (?:is|was) not confirmed|payment source does not confirm)\b/i,
  CAUSE_NOT_DETERMINED:
    /\b(cause (?:is )?not determined|cause cannot be determined|could not determine (?:the )?cause)\b/i,
};

const QUEUE_LANGUAGE: Record<ReviewQueue, RegExp> = {
  FULFILMENT_OPERATIONS: /\bfulfilment operations\b/i,
  SHIPPING_OPERATIONS: /\bshipping operations\b/i,
  OPERATIONS_DATA_REVIEW: /\boperations data review\b/i,
  GENERAL_COMMERCE_OPERATIONS: /\bgeneral commerce operations\b/i,
  PAYMENT_OPERATIONS: /\bpayment operations\b/i,
};

export function validateGroundedExplanation(
  explanation: ModelExplanation,
  state: AuthoritativeAgentState,
): GroundingIssueCode[] {
  const text = `${explanation.summary}\n${explanation.reason}\n${explanation.nextStep ?? ""}`;
  const issues: GroundingIssueCode[] = [];

  // The host owns and appends the exact server-produced next step. Gemini must
  // leave this field null so wording drift cannot alter operational guidance.
  if (explanation.nextStep !== null) {
    issues.push("NEXT_STEP_MISMATCH");
  }
  if (FALSE_CHANGE.test(text)) {
    issues.push("FALSE_STATE_CHANGE");
  }
  if (state.reviewCaseId === null && FALSE_REVIEW_CASE.test(text)) {
    issues.push("FALSE_REVIEW_CASE_CLAIM");
  }
  if (SECRET_LIKE.test(text)) {
    issues.push("SECRET_LIKE_CONTENT");
  }

  for (const warehouse of text.match(WAREHOUSE_PATTERN) ?? []) {
    if (!state.authoritativeWarehouseIds.includes(warehouse)) {
      issues.push("INVENTED_WAREHOUSE");
      break;
    }
  }

  const allowedIds = new Set(
    [state.orderId, state.investigationId, state.reviewCaseId].filter(
      (value): value is string => value !== null,
    ),
  );
  for (const identifier of text.match(IDENTIFIER_PATTERN) ?? []) {
    if (!allowedIds.has(identifier)) {
      issues.push("INVENTED_IDENTIFIER");
      break;
    }
  }

  for (const diagnosis of DiagnosisCodeSchema.options) {
    if (text.includes(diagnosis) && diagnosis !== state.diagnosisCode) {
      issues.push("UNSUPPORTED_DIAGNOSIS");
      break;
    }
  }
  for (const [diagnosis, pattern] of Object.entries(
    DIAGNOSIS_LANGUAGE,
  ) as Array<[DiagnosisCode, RegExp]>) {
    if (pattern.test(text) && diagnosis !== state.diagnosisCode) {
      issues.push("UNSUPPORTED_DIAGNOSIS");
      break;
    }
  }
  if (
    (state.evidenceStatus === "MISSING" ||
      state.evidenceStatus === "CONFLICTING") &&
    !UNCERTAINTY_LANGUAGE.test(text)
  ) {
    issues.push("UNSUPPORTED_DIAGNOSIS");
  }

  for (const queue of ReviewQueueSchema.options) {
    if (text.includes(queue) && queue !== state.suggestedQueue) {
      issues.push("UNSUPPORTED_QUEUE");
      break;
    }
  }
  for (const [queue, pattern] of Object.entries(QUEUE_LANGUAGE) as Array<
    [ReviewQueue, RegExp]
  >) {
    if (pattern.test(text) && queue !== state.suggestedQueue) {
      issues.push("UNSUPPORTED_QUEUE");
      break;
    }
  }

  return [...new Set(issues)];
}

export function assembleGroundedMessage(
  explanation: ModelExplanation,
  suggestedNextStep: string | null,
): string {
  return [
    explanation.summary,
    explanation.reason,
    suggestedNextStep ? `Next step: ${suggestedNextStep}` : null,
    "No commerce state was changed.",
  ]
    .filter((value): value is string => Boolean(value))
    .join("\n");
}

export function isApprovedToolName(value: string): boolean {
  return (APPROVED_AGENT_TOOL_NAMES as readonly string[]).includes(value);
}
