import type {
  DiagnosisCode,
  EvidenceStatus,
  ModelExplanation,
  ReviewQueue,
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
}

export function createEmptyAuthoritativeState(): AuthoritativeAgentState {
  return {
    orderId: null,
    investigationId: null,
    reviewCaseId: null,
    evidenceStatus: null,
    diagnosisCode: null,
    shouldEscalate: null,
    suggestedQueue: null,
    suggestedNextStep: null,
    eligibleAlternativeWarehouseIds: [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(record: Record<string, unknown>, key: string): string | null {
  return typeof record[key] === "string" ? record[key] : null;
}

export function isSuccessfulMcpOutput(value: unknown): boolean {
  return isRecord(value) && value.ok === true && isRecord(value.result);
}

export function projectMcpResult(
  toolName: string,
  output: unknown,
  state: AuthoritativeAgentState,
): JsonObject {
  if (!isRecord(output) || output.ok !== true || !isRecord(output.result)) {
    return { ok: false, commerceStateChanged: false };
  }
  const result = output.result;

  if (toolName === "investigate_order_exception") {
    const decision = isRecord(result.decision) ? result.decision : {};
    state.orderId = stringValue(result, "orderId") ?? stringValue(decision, "orderId");
    state.investigationId = stringValue(result, "investigationId");
    state.evidenceStatus = stringValue(decision, "evidenceStatus") as EvidenceStatus | null;
    state.diagnosisCode = stringValue(decision, "diagnosisCode") as DiagnosisCode | null;
    state.shouldEscalate = typeof decision.shouldEscalate === "boolean" ? decision.shouldEscalate : null;
    state.suggestedQueue = stringValue(decision, "suggestedQueue") as ReviewQueue | null;
    state.suggestedNextStep = stringValue(decision, "suggestedNextStep");
    state.eligibleAlternativeWarehouseIds = Array.isArray(decision.eligibleAlternativeWarehouseIds)
      ? decision.eligibleAlternativeWarehouseIds.filter((value): value is string => typeof value === "string")
      : [];
    return {
      orderId: state.orderId,
      investigationId: state.investigationId,
      investigationStatus: result.status ?? null,
      evidenceStatus: state.evidenceStatus,
      diagnosisCode: state.diagnosisCode,
      matchedRule: decision.matchedRule ?? null,
      shouldEscalate: state.shouldEscalate,
      suggestedQueue: state.suggestedQueue,
      suggestedNextStep: state.suggestedNextStep,
      eligibleAlternativeWarehouseIds: state.eligibleAlternativeWarehouseIds,
      supportingFacts: Array.isArray(decision.supportingFacts)
        ? decision.supportingFacts
        : [],
      commerceStateChanged: false,
    };
  }

  if (toolName === "create_human_review_escalation") {
    state.reviewCaseId = stringValue(result, "reviewCaseId");
    state.investigationId = stringValue(result, "investigationId") ?? state.investigationId;
    state.orderId = stringValue(result, "orderId") ?? state.orderId;
    state.suggestedQueue = (stringValue(result, "queue") as ReviewQueue | null) ?? state.suggestedQueue;
    state.suggestedNextStep = stringValue(result, "suggestedNextStep") ?? state.suggestedNextStep;
    return {
      reviewCaseId: state.reviewCaseId,
      investigationId: state.investigationId,
      orderId: state.orderId,
      disposition: result.disposition ?? null,
      queue: state.suggestedQueue,
      reasonCode: result.reasonCode ?? null,
      suggestedNextStep: state.suggestedNextStep,
      commerceStateChanged: false,
    };
  }

  if (toolName === "list_demo_cases") {
    return {
      purpose: result.purpose ?? null,
      cases: Array.isArray(result.cases) ? result.cases : [],
      commerceStateChanged: false,
    };
  }

  if (toolName === "get_review_case") {
    const reviewCase = isRecord(result.reviewCase) ? result.reviewCase : {};
    state.reviewCaseId = stringValue(reviewCase, "reviewCaseId") ?? stringValue(reviewCase, "id");
    state.investigationId = stringValue(reviewCase, "investigationId");
    state.orderId = stringValue(reviewCase, "orderId");
    return {
      reviewCaseId: state.reviewCaseId,
      investigationId: state.investigationId,
      orderId: state.orderId,
      status: reviewCase.status ?? null,
      queue: reviewCase.queue ?? null,
      reasonCode: reviewCase.reasonCode ?? null,
      commerceStateChanged: false,
    };
  }

  const investigation = isRecord(result.investigation) ? result.investigation : {};
  state.investigationId = stringValue(investigation, "investigationId") ?? stringValue(investigation, "id");
  state.orderId = stringValue(investigation, "orderId");
  return {
    investigationId: state.investigationId,
    orderId: state.orderId,
    status: investigation.status ?? null,
    evidenceStatus: investigation.evidenceStatus ?? null,
    diagnosisCode: investigation.diagnosisCode ?? null,
    auditEventCount: Array.isArray(result.auditEvents) ? result.auditEvents.length : 0,
    commerceStateChanged: false,
  };
}

const FALSE_CHANGE = /\b(was|has been|successfully)\s+(reassigned|released|retried|updated|created|shipped|fixed)\b/i;
const SECRET_LIKE = /\b(?:AIza|AQ\.)[A-Za-z0-9_-]{20,}\b/;

export function validateGroundedExplanation(
  explanation: ModelExplanation,
  state: AuthoritativeAgentState,
): string[] {
  const text = `${explanation.summary}\n${explanation.reason}\n${explanation.nextStep ?? ""}`;
  const issues: string[] = [];
  if (explanation.nextStep !== state.suggestedNextStep) {
    issues.push("NEXT_STEP_MISMATCH");
  }
  if (FALSE_CHANGE.test(text)) {
    issues.push("FALSE_STATE_CHANGE");
  }
  if (SECRET_LIKE.test(text)) {
    issues.push("SECRET_LIKE_CONTENT");
  }
  for (const warehouse of text.match(/\bWH-[A-Za-z0-9-]+\b/g) ?? []) {
    if (!state.eligibleAlternativeWarehouseIds.includes(warehouse)) {
      issues.push("INVENTED_WAREHOUSE");
      break;
    }
  }
  return [...new Set(issues)];
}

export function assembleGroundedMessage(explanation: ModelExplanation): string {
  return [
    explanation.summary,
    explanation.reason,
    explanation.nextStep ? `Next step: ${explanation.nextStep}` : null,
    "No commerce state was changed.",
  ]
    .filter((value): value is string => Boolean(value))
    .join("\n");
}
