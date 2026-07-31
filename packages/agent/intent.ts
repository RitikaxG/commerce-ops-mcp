export const ORDER_ID_PATTERN = /\bORD-\d{4,}\b/i;
export const INVESTIGATION_ID_PATTERN = /\bINV-[A-Za-z0-9-]+\b/;
export const REVIEW_CASE_ID_PATTERN = /\b(?:CASE|ESC)-[A-Za-z0-9-]+\b/;

const MUTATION_PATTERN = /\b(reassign|release\s+(?:the\s+)?hold|retry|update|change|create\s+(?:a\s+)?shipment|reserve|run\s+sql|delete|cancel|mark\s+as\s+paid)\b/i;
const ESCALATION_PATTERN = /\b(escalat|human[- ]review|review case|create a case)\b/i;
const DEMO_PATTERN = /\b(demo|examples?|test cases?|orders can i test|available orders)\b/i;
const TRACE_PATTERN = /\b(trace|audit)\b/i;
const REVIEW_PATTERN = /\b(review case|human[- ]review case)\b/i;

export interface IntentPreflight {
  readonly refusal: boolean;
  readonly explicitEscalation: boolean;
  readonly needsIdentifier:
    | "ORDER_OR_WORKFLOW_ID"
    | "INVESTIGATION_ID"
    | "REVIEW_CASE_ID"
    | null;
}

export function preflightIntent(message: string): IntentPreflight {
  const hasOrder = ORDER_ID_PATTERN.test(message);
  const hasInvestigation = INVESTIGATION_ID_PATTERN.test(message);
  const hasReviewCase = REVIEW_CASE_ID_PATTERN.test(message);
  const demoDiscovery = DEMO_PATTERN.test(message);

  let needsIdentifier: IntentPreflight["needsIdentifier"] = null;
  if (TRACE_PATTERN.test(message) && !hasInvestigation) {
    needsIdentifier = "INVESTIGATION_ID";
  } else if (REVIEW_PATTERN.test(message) && !hasReviewCase && !hasOrder) {
    needsIdentifier = "REVIEW_CASE_ID";
  } else if (!hasOrder && !hasInvestigation && !hasReviewCase && !demoDiscovery) {
    needsIdentifier = "ORDER_OR_WORKFLOW_ID";
  }

  return {
    refusal: MUTATION_PATTERN.test(message),
    explicitEscalation: ESCALATION_PATTERN.test(message),
    needsIdentifier,
  };
}
