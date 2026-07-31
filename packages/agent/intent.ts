export const ORDER_ID_PATTERN = /\bORD-\d{4,}\b/i;
export const INVESTIGATION_ID_PATTERN = /\bINV-[A-Za-z0-9-]+\b/i;
export const REVIEW_CASE_ID_PATTERN = /\b(?:CASE|ESC)-[A-Za-z0-9-]+\b/i;

const MUTATION_PATTERN =
  /\b(reassign|release\s+(?:the\s+)?hold|retry|update|change|create\s+(?:a\s+)?shipment|reserve|run\s+sql|delete|cancel|mark\s+as\s+paid)\b/i;
const INVESTIGATION_PATTERN =
  /\b(investigat|diagnos|look into|check|why|blocking|not shipped|shipment gap|current state)\b/i;
const ESCALATION_PATTERN =
  /\b(escalat|human[- ]review|review case|create a case)\b/i;
const DEMO_PATTERN =
  /\b(demo|examples?|test cases?|orders can i test|available orders)\b/i;
const TRACE_PATTERN = /\b(trace|audit)\b/i;
const REVIEW_PATTERN = /\b(review case|human[- ]review case)\b/i;

export type AgentIntentKind =
  | "DEMO_DISCOVERY"
  | "INVESTIGATION"
  | "ESCALATION"
  | "TRACE_READ"
  | "REVIEW_CASE_READ"
  | "MUTATION"
  | "UNKNOWN";

export interface IntentPreflight {
  readonly kind: AgentIntentKind;
  readonly explicitEscalation: boolean;
  readonly orderId: string | null;
  readonly investigationId: string | null;
  readonly reviewCaseId: string | null;
  readonly needsIdentifier:
    | "ORDER_OR_WORKFLOW_ID"
    | "INVESTIGATION_ID"
    | "REVIEW_CASE_ID"
    | null;
}

function firstMatch(pattern: RegExp, message: string): string | null {
  return message.match(pattern)?.[0]?.toUpperCase() ?? null;
}

export function preflightIntent(message: string): IntentPreflight {
  const orderId = firstMatch(ORDER_ID_PATTERN, message);
  const investigationId = firstMatch(INVESTIGATION_ID_PATTERN, message);
  const reviewCaseId = firstMatch(REVIEW_CASE_ID_PATTERN, message);
  const explicitEscalation = ESCALATION_PATTERN.test(message);
  const investigationRequest = INVESTIGATION_PATTERN.test(message);

  if (DEMO_PATTERN.test(message) && !orderId) {
    return {
      kind: "DEMO_DISCOVERY",
      explicitEscalation: false,
      orderId,
      investigationId,
      reviewCaseId,
      needsIdentifier: null,
    };
  }

  if (TRACE_PATTERN.test(message)) {
    return {
      kind: "TRACE_READ",
      explicitEscalation: false,
      orderId,
      investigationId,
      reviewCaseId,
      needsIdentifier: investigationId ? null : "INVESTIGATION_ID",
    };
  }

  if (REVIEW_PATTERN.test(message) && !investigationRequest && !orderId) {
    return {
      kind: "REVIEW_CASE_READ",
      explicitEscalation: false,
      orderId,
      investigationId,
      reviewCaseId,
      needsIdentifier: reviewCaseId ? null : "REVIEW_CASE_ID",
    };
  }

  if (explicitEscalation && investigationId && !orderId) {
    return {
      kind: "ESCALATION",
      explicitEscalation,
      orderId,
      investigationId,
      reviewCaseId,
      needsIdentifier: null,
    };
  }

  if (orderId && (investigationRequest || explicitEscalation)) {
    return {
      kind: "INVESTIGATION",
      explicitEscalation,
      orderId,
      investigationId,
      reviewCaseId,
      needsIdentifier: null,
    };
  }

  if (MUTATION_PATTERN.test(message)) {
    return {
      kind: "MUTATION",
      explicitEscalation,
      orderId,
      investigationId,
      reviewCaseId,
      needsIdentifier: null,
    };
  }

  return {
    kind: "UNKNOWN",
    explicitEscalation,
    orderId,
    investigationId,
    reviewCaseId,
    needsIdentifier: "ORDER_OR_WORKFLOW_ID",
  };
}
