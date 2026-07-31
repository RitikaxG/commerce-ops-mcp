import { randomUUID } from "node:crypto";

export interface AgentIdentifierGenerator {
  createRunId(): string;
  createClientRequestId(): string;
  createInvestigationIdempotencyKey(): string;
  createEscalationIdempotencyKey(investigationId: string): string;
}

export function createRuntimeIdentifierGenerator(): AgentIdentifierGenerator {
  return {
    createRunId: () => `AGENT-${randomUUID()}`,
    createClientRequestId: () => `REQ-${randomUUID()}`,
    createInvestigationIdempotencyKey: () => `IDEMP-INV-${randomUUID()}`,
    createEscalationIdempotencyKey: () => `IDEMP-ESC-${randomUUID()}`,
  };
}

export function createDeterministicIdentifierGenerator(
  namespace: string,
): AgentIdentifierGenerator {
  let counter = 0;
  const next = (kind: string) => `${kind}-${namespace}-${++counter}`;
  return {
    createRunId: () => next("AGENT"),
    createClientRequestId: () => next("REQ"),
    createInvestigationIdempotencyKey: () => next("IDEMP-INV"),
    createEscalationIdempotencyKey: () => next("IDEMP-ESC"),
  };
}
