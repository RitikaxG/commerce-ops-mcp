import {
  ESCALATION_TOOL_NAME,
  INVESTIGATION_TOOL_NAME,
  createWorkflowRepositoryContext,
  type CommerceReadRepository,
  type OperationsWorkflowRepository,
} from "@repo/db";
import {
  createDiagnosisEngine,
  createEvidenceReadinessEvaluator,
  type DiagnosisEngine,
} from "@repo/diagnosis";
import {
  createEvidenceCollector,
  type EvidenceCollector,
} from "@repo/evidence";
import {
  buildFailedInvestigationAuditEvents,
  buildInvestigationAuditEvents,
  buildReviewCaseAuditEvents,
  createInvestigationTraceReader,
  type AuditEventKeyFactory,
  type InvestigationTraceReader,
} from "@repo/observability";
import {
  CreateHumanReviewEscalationInputSchema,
  GetInvestigationTraceInputSchema,
  GetReviewCaseInputSchema,
  HumanReviewEscalationResultSchema,
  InvestigateOrderExceptionInputSchema,
  InvestigationWorkflowResultSchema,
  InvestigationWorkflowSuccessSchema,
  ListDemoCasesResultSchema,
  PersistedEvidenceSourceObservationsSchema,
  PersistedInvestigationEvidenceSchema,
  ReviewCaseResultSchema,
  type CreateHumanReviewEscalationInput,
  type GetInvestigationTraceInput,
  type GetReviewCaseInput,
  type HumanReviewEscalationResult,
  type InvestigateOrderExceptionInput,
  type InvestigationTrace,
  type InvestigationWorkflowResult,
  type ListDemoCasesResult,
  type EvidenceReadinessResult,
  type NormalizedOrderEvidence,
  type PersistedInvestigationSummary,
  type PersistedReviewCase,
  type ReviewCaseResult,
  type ReviewReasonCode,
  type WorkflowErrorCode,
} from "@repo/schemas";
import { createHash, randomUUID } from "node:crypto";
import type { z } from "zod";

export interface WorkflowClock {
  now(): Date;
}

export interface WorkflowIdentifierFactory extends AuditEventKeyFactory {
  nextInvestigationId(): string;
  nextTraceId(): string;
  nextReviewCaseId(): string;
}

export interface EvidenceReadinessEvaluator {
  evaluate(evidence: NormalizedOrderEvidence): EvidenceReadinessResult;
}

export interface CommerceOperationsWorkflow {
  listDemoCases(): Promise<ListDemoCasesResult>;
  investigateOrderException(
    input: InvestigateOrderExceptionInput,
  ): Promise<InvestigationWorkflowResult>;
  createHumanReviewEscalation(
    input: CreateHumanReviewEscalationInput,
  ): Promise<HumanReviewEscalationResult>;
  getReviewCase(input: GetReviewCaseInput): Promise<ReviewCaseResult>;
  getInvestigationTrace(
    input: GetInvestigationTraceInput,
  ): Promise<InvestigationTrace>;
}

export interface CommerceOperationsWorkflowContext {
  readonly workflow: CommerceOperationsWorkflow;
  disconnect(): Promise<void>;
}

export interface CommerceOperationsWorkflowDependencies {
  commerce: CommerceReadRepository;
  operations: OperationsWorkflowRepository;
  evidenceCollector: EvidenceCollector;
  readiness: EvidenceReadinessEvaluator;
  diagnosis: DiagnosisEngine;
  clock: WorkflowClock;
  identifiers: WorkflowIdentifierFactory;
  traceReader?: InvestigationTraceReader;
}

const systemClock: WorkflowClock = { now: () => new Date() };
const demoEvidenceClock: WorkflowClock = {
  now: () => new Date("2026-07-30T12:00:00.000Z"),
};
const runtimeIdentifiers: WorkflowIdentifierFactory = {
  nextInvestigationId: () => `INV-${randomUUID()}`,
  nextTraceId: () => `TRACE-${randomUUID()}`,
  nextReviewCaseId: () => `CASE-${randomUUID()}`,
  nextAuditEventKey: () => `AUDIT-${randomUUID()}`,
};

const demoCaseCatalog = ListDemoCasesResultSchema.parse({
  schemaVersion: 1,
  purpose: "DEMO_DISCOVERY_ONLY",
  cases: [
    {
      orderId: "ORD-1042",
      title:
        "Assigned warehouse is out of stock; another warehouse has enough stock",
      category: "INVENTORY",
    },
    {
      orderId: "ORD-1043",
      title: "Payment succeeded, but fulfilment creation failed",
      category: "FULFILMENT",
    },
    {
      orderId: "ORD-1044",
      title: "Fulfilment is still within the expected processing window",
      category: "PROCESSING",
    },
    {
      orderId: "ORD-1045",
      title: "Shipment-label creation failed",
      category: "SHIPPING",
    },
    {
      orderId: "ORD-1046",
      title: "Required inventory evidence is missing",
      category: "DATA_QUALITY",
    },
    {
      orderId: "ORD-1047",
      title: "A shipment already exists",
      category: "SHIPMENT",
    },
    {
      orderId: "ORD-1048",
      title: "Available evidence does not identify a confirmed cause",
      category: "GENERAL",
    },
    {
      orderId: "ORD-1049",
      title:
        "Operator says paid, but the authoritative payment source reports PROCESSING",
      category: "PAYMENT",
    },
    {
      orderId: "ORD-1050",
      title: "Inventory sources report conflicting quantities",
      category: "DATA_QUALITY",
    },
  ],
  commerceStateChanged: false,
});

const safeMessages = {
  INVALID_INPUT: "The workflow input is invalid.",
  ORDER_NOT_FOUND: "The requested order was not found.",
  ORDER_SOURCE_UNAVAILABLE: "The order source is unavailable.",
  INVESTIGATION_NOT_FOUND: "The requested investigation was not found.",
  REVIEW_CASE_NOT_FOUND: "The requested review case was not found.",
  INVESTIGATION_NOT_TERMINAL:
    "The investigation has not reached a terminal state.",
  ESCALATION_NOT_ALLOWED:
    "The investigation outcome does not require human action.",
  IDEMPOTENCY_KEY_REUSE:
    "The idempotency key was already used for different input.",
  CLIENT_REQUEST_ID_REUSE:
    "The client request ID was already used for a different order.",
  INVALID_STORED_RESPONSE:
    "A stored workflow response failed contract validation.",
  WORKFLOW_PERSISTENCE_FAILED:
    "The workflow result could not be persisted safely.",
} satisfies Record<WorkflowErrorCode, string>;

export class WorkflowError extends Error {
  readonly code: WorkflowErrorCode;

  constructor(code: WorkflowErrorCode) {
    super(safeMessages[code]);
    this.name = "WorkflowError";
    this.code = code;
  }
}

function workflowInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new WorkflowError("INVALID_INPUT");
  }
  return result.data;
}

function now(clock: WorkflowClock): string {
  return clock.now().toISOString();
}

function requestHash(value: Record<string, string>): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function parseStoredInvestigationResponse(
  value: unknown,
): InvestigationWorkflowResult {
  const parsed = InvestigationWorkflowResultSchema.safeParse(value);
  if (!parsed.success) {
    throw new WorkflowError("INVALID_STORED_RESPONSE");
  }
  return parsed.data;
}

function parseStoredEscalationResponse(
  value: unknown,
): HumanReviewEscalationResult {
  const parsed = HumanReviewEscalationResultSchema.safeParse(value);
  if (!parsed.success) {
    throw new WorkflowError("INVALID_STORED_RESPONSE");
  }
  return parsed.data;
}

function reasonForInvestigation(
  investigation: PersistedInvestigationSummary,
): ReviewReasonCode | null {
  if (
    investigation.status === "NEEDS_MORE_INFO" &&
    investigation.evidenceStatus === "MISSING"
  ) {
    return "MISSING_EVIDENCE";
  }
  if (
    investigation.status === "NEEDS_MORE_INFO" &&
    investigation.evidenceStatus === "CONFLICTING"
  ) {
    return "CONFLICTING_EVIDENCE";
  }
  if (investigation.status !== "COMPLETED") {
    return null;
  }
  switch (investigation.diagnosisCode) {
    case "ASSIGNED_WAREHOUSE_OUT_OF_STOCK":
    case "FULFILMENT_CREATION_FAILED":
    case "SHIPMENT_LABEL_CREATION_FAILED":
    case "PAYMENT_NOT_CONFIRMED":
    case "CAUSE_NOT_DETERMINED":
      return investigation.diagnosisCode;
    default:
      return null;
  }
}

class DefaultCommerceOperationsWorkflow implements CommerceOperationsWorkflow {
  private readonly traceReader: InvestigationTraceReader;

  constructor(
    private readonly dependencies: CommerceOperationsWorkflowDependencies,
  ) {
    this.traceReader =
      dependencies.traceReader ??
      createInvestigationTraceReader(dependencies.operations);
  }

  async listDemoCases(): Promise<ListDemoCasesResult> {
    return demoCaseCatalog;
  }

  private async replayInvestigationIdempotency(
    idempotencyKey: string,
    hash: string,
  ): Promise<InvestigationWorkflowResult | null> {
    const stored = await this.dependencies.operations.findIdempotencyRecord(
      INVESTIGATION_TOOL_NAME,
      idempotencyKey,
    );
    if (!stored) {
      return null;
    }
    if (stored.requestHash !== hash) {
      throw new WorkflowError("IDEMPOTENCY_KEY_REUSE");
    }
    const result = parseStoredInvestigationResponse(stored.responseSnapshot);
    if (
      stored.resourceType !== "INVESTIGATION" ||
      stored.resourceId !== result.investigationId
    ) {
      throw new WorkflowError("INVALID_STORED_RESPONSE");
    }
    return result;
  }

  private async attachClientRequestReplay(input: {
    investigation: PersistedInvestigationSummary;
    orderId: string;
    idempotencyKey: string;
    hash: string;
  }): Promise<InvestigationWorkflowResult> {
    if (input.investigation.orderId !== input.orderId) {
      throw new WorkflowError("CLIENT_REQUEST_ID_REUSE");
    }
    const snapshot =
      await this.dependencies.operations.findStoredInvestigationResponse(
        input.investigation.investigationId,
      );
    if (snapshot === null) {
      throw new WorkflowError("INVALID_STORED_RESPONSE");
    }
    const result = parseStoredInvestigationResponse(snapshot);
    if (
      result.investigationId !== input.investigation.investigationId ||
      result.clientRequestId !== input.investigation.clientRequestId ||
      result.orderId !== input.orderId
    ) {
      throw new WorkflowError("INVALID_STORED_RESPONSE");
    }
    try {
      const write =
        await this.dependencies.operations.attachInvestigationIdempotency({
          result,
          idempotencyKey: input.idempotencyKey,
          requestHash: input.hash,
          createdAt: now(this.dependencies.clock),
        });
      if (write.kind === "COMMITTED") {
        return result;
      }
    } catch {
      // Resolve an interrupted single-row commit through the idempotency key.
    }
    const replay = await this.replayInvestigationIdempotency(
      input.idempotencyKey,
      input.hash,
    );
    if (replay) {
      return replay;
    }
    throw new WorkflowError("WORKFLOW_PERSISTENCE_FAILED");
  }

  private async resolveInvestigationRace(input: {
    orderId: string;
    clientRequestId: string;
    idempotencyKey: string;
    hash: string;
  }): Promise<InvestigationWorkflowResult | null> {
    const replay = await this.replayInvestigationIdempotency(
      input.idempotencyKey,
      input.hash,
    );
    if (replay) {
      return replay;
    }
    const existing =
      await this.dependencies.operations.findInvestigationByClientRequestId(
        input.clientRequestId,
      );
    return existing
      ? this.attachClientRequestReplay({
          investigation: existing,
          orderId: input.orderId,
          idempotencyKey: input.idempotencyKey,
          hash: input.hash,
        })
      : null;
  }

  private async tryResolveInvestigationRace(input: {
    orderId: string;
    clientRequestId: string;
    idempotencyKey: string;
    hash: string;
  }): Promise<InvestigationWorkflowResult | null> {
    try {
      return await this.resolveInvestigationRace(input);
    } catch (error) {
      if (error instanceof WorkflowError) {
        throw error;
      }
      return null;
    }
  }

  async investigateOrderException(
    rawInput: InvestigateOrderExceptionInput,
  ): Promise<InvestigationWorkflowResult> {
    const input = workflowInput(InvestigateOrderExceptionInputSchema, rawInput);
    const hash = requestHash({
      orderId: input.orderId,
      clientRequestId: input.clientRequestId,
    });

    try {
      const replay = await this.replayInvestigationIdempotency(
        input.idempotencyKey,
        hash,
      );
      if (replay) {
        return replay;
      }
      const clientRequest =
        await this.dependencies.operations.findInvestigationByClientRequestId(
          input.clientRequestId,
        );
      if (clientRequest) {
        return await this.attachClientRequestReplay({
          investigation: clientRequest,
          orderId: input.orderId,
          idempotencyKey: input.idempotencyKey,
          hash,
        });
      }
    } catch (error) {
      if (error instanceof WorkflowError) {
        throw error;
      }
      throw new WorkflowError("WORKFLOW_PERSISTENCE_FAILED");
    }

    let anchoredOrder;
    try {
      anchoredOrder = await this.dependencies.commerce.findOrderById(
        input.orderId,
      );
    } catch {
      throw new WorkflowError("ORDER_SOURCE_UNAVAILABLE");
    }
    if (anchoredOrder === null) {
      throw new WorkflowError("ORDER_NOT_FOUND");
    }

    const investigationId = this.dependencies.identifiers.nextInvestigationId();
    const traceId = this.dependencies.identifiers.nextTraceId();
    const createdAt = now(this.dependencies.clock);

    try {
      const evidence = await this.dependencies.evidenceCollector.collect(
        input.orderId,
      );
      const readiness = this.dependencies.readiness.evaluate(evidence);
      const decision = this.dependencies.diagnosis.decide({
        evidence,
        readiness,
      });
      const completedAt = now(this.dependencies.clock);
      const result = InvestigationWorkflowSuccessSchema.parse({
        schemaVersion: 1,
        investigationId,
        traceId,
        clientRequestId: input.clientRequestId,
        orderId: input.orderId,
        status: decision.investigationStatus,
        decision,
        evidenceSnapshotSchemaVersion: 1,
        createdAt,
        completedAt,
        commerceStateChanged: false,
      });
      const sourceObservedAt = PersistedEvidenceSourceObservationsSchema.parse(
        Object.fromEntries(
          evidence.sourceReads.map(({ source, ...observation }) => [
            source,
            observation,
          ]),
        ),
      );
      const persistedEvidence = PersistedInvestigationEvidenceSchema.parse({
        schemaVersion: 1,
        investigationId,
        snapshotSchemaVersion: 1,
        snapshot: evidence,
        missingFields: readiness.missingFields,
        conflicts: readiness.conflicts,
        sourceObservedAt,
        createdAt,
      });
      const auditEvents = buildInvestigationAuditEvents({
        traceId,
        investigationId,
        createdAt: completedAt,
        keys: this.dependencies.identifiers,
        orderId: input.orderId,
        clientRequestId: input.clientRequestId,
        evidence,
        decision,
      });

      try {
        const write =
          await this.dependencies.operations.persistInvestigationSuccess({
            result,
            evidence: persistedEvidence,
            auditEvents,
            idempotencyKey: input.idempotencyKey,
            requestHash: hash,
          });
        if (write.kind === "COMMITTED") {
          return result;
        }
      } catch {
        // An interrupted commit is resolved by durable identity before a
        // technical failure is recorded.
      }
      const recovered = await this.tryResolveInvestigationRace({
        ...input,
        hash,
      });
      if (recovered) {
        return recovered;
      }
      throw new Error("investigation persistence did not commit");
    } catch (error) {
      if (error instanceof WorkflowError) {
        throw error;
      }
      const recovered = await this.tryResolveInvestigationRace({
        ...input,
        hash,
      });
      if (recovered) {
        return recovered;
      }

      const completedAt = now(this.dependencies.clock);
      const failure = InvestigationWorkflowResultSchema.parse({
        schemaVersion: 1,
        investigationId,
        traceId,
        clientRequestId: input.clientRequestId,
        orderId: input.orderId,
        status: "FAILED",
        errorCode: "WORKFLOW_EXECUTION_FAILED",
        createdAt,
        completedAt,
        commerceStateChanged: false,
      });
      if (failure.status !== "FAILED") {
        throw new WorkflowError("WORKFLOW_PERSISTENCE_FAILED");
      }
      const failureEvents = buildFailedInvestigationAuditEvents({
        traceId,
        investigationId,
        createdAt: completedAt,
        keys: this.dependencies.identifiers,
        orderId: input.orderId,
        clientRequestId: input.clientRequestId,
        errorCode: failure.errorCode,
      });
      try {
        const write =
          await this.dependencies.operations.persistInvestigationFailure({
            result: failure,
            auditEvents: failureEvents,
            idempotencyKey: input.idempotencyKey,
            requestHash: hash,
          });
        if (write.kind === "COMMITTED") {
          return failure;
        }
        const replay = await this.tryResolveInvestigationRace({
          ...input,
          hash,
        });
        if (replay) {
          return replay;
        }
      } catch {
        try {
          const replay = await this.tryResolveInvestigationRace({
            ...input,
            hash,
          });
          if (replay) {
            return replay;
          }
        } catch (replayError) {
          if (replayError instanceof WorkflowError) {
            throw replayError;
          }
        }
      }
      throw new WorkflowError("WORKFLOW_PERSISTENCE_FAILED");
    }
  }

  private async replayEscalationIdempotency(
    idempotencyKey: string,
    hash: string,
  ): Promise<HumanReviewEscalationResult | null> {
    const stored = await this.dependencies.operations.findIdempotencyRecord(
      ESCALATION_TOOL_NAME,
      idempotencyKey,
    );
    if (!stored) {
      return null;
    }
    if (stored.requestHash !== hash) {
      throw new WorkflowError("IDEMPOTENCY_KEY_REUSE");
    }
    const result = parseStoredEscalationResponse(stored.responseSnapshot);
    if (
      stored.resourceType !== "HUMAN_REVIEW_ESCALATION" ||
      stored.resourceId !== result.reviewCaseId
    ) {
      throw new WorkflowError("INVALID_STORED_RESPONSE");
    }
    return result;
  }

  private reusedEscalationResult(
    reviewCase: PersistedReviewCase,
  ): HumanReviewEscalationResult & { disposition: "REUSED" } {
    const result = HumanReviewEscalationResultSchema.parse({
      schemaVersion: 1,
      disposition: "REUSED",
      reviewCaseId: reviewCase.reviewCaseId,
      investigationId: reviewCase.investigationId,
      orderId: reviewCase.orderId,
      status: reviewCase.status,
      queue: reviewCase.queue,
      reasonCode: reviewCase.reasonCode,
      suggestedNextStep: reviewCase.suggestedNextStep,
      dedupeKey: reviewCase.dedupeKey,
      createdAt: reviewCase.createdAt,
      updatedAt: reviewCase.updatedAt,
      commerceStateChanged: false,
    });
    if (result.disposition !== "REUSED") {
      throw new WorkflowError("INVALID_STORED_RESPONSE");
    }
    return result as HumanReviewEscalationResult & { disposition: "REUSED" };
  }

  private async persistReuse(input: {
    result: HumanReviewEscalationResult & { disposition: "REUSED" };
    traceId: string;
    idempotencyKey: string;
    hash: string;
  }): Promise<HumanReviewEscalationResult> {
    const auditAt = now(this.dependencies.clock);
    try {
      const write = await this.dependencies.operations.persistReusedReviewCase({
        result: input.result,
        traceId: input.traceId,
        auditEvents: buildReviewCaseAuditEvents({
          traceId: input.traceId,
          investigationId: input.result.investigationId,
          reviewCaseId: input.result.reviewCaseId,
          createdAt: auditAt,
          keys: this.dependencies.identifiers,
          disposition: "REUSED",
          orderId: input.result.orderId,
          queue: input.result.queue,
          reasonCode: input.result.reasonCode,
        }),
        idempotencyKey: input.idempotencyKey,
        requestHash: input.hash,
        persistedAt: auditAt,
      });
      if (write.kind === "COMMITTED") {
        return input.result;
      }
    } catch {
      // Resolve an interrupted reuse transaction through the idempotency key.
    }
    const replay = await this.replayEscalationIdempotency(
      input.idempotencyKey,
      input.hash,
    );
    if (replay) {
      return replay;
    }
    throw new WorkflowError("WORKFLOW_PERSISTENCE_FAILED");
  }

  async createHumanReviewEscalation(
    rawInput: CreateHumanReviewEscalationInput,
  ): Promise<HumanReviewEscalationResult> {
    const input = workflowInput(
      CreateHumanReviewEscalationInputSchema,
      rawInput,
    );
    const hash = requestHash({ investigationId: input.investigationId });
    try {
      const replay = await this.replayEscalationIdempotency(
        input.idempotencyKey,
        hash,
      );
      if (replay) {
        return replay;
      }
      const investigation =
        await this.dependencies.operations.findInvestigationById(
          input.investigationId,
        );
      if (!investigation) {
        throw new WorkflowError("INVESTIGATION_NOT_FOUND");
      }
      if (investigation.status === "RUNNING") {
        throw new WorkflowError("INVESTIGATION_NOT_TERMINAL");
      }
      const reasonCode = reasonForInvestigation(investigation);
      if (
        reasonCode === null ||
        investigation.suggestedQueue === null ||
        investigation.suggestedNextStep === null
      ) {
        throw new WorkflowError("ESCALATION_NOT_ALLOWED");
      }

      const existing =
        await this.dependencies.operations.findReviewCaseByInvestigationId(
          input.investigationId,
        );
      if (existing) {
        const reused = this.reusedEscalationResult(existing);
        return await this.persistReuse({
          result: reused,
          traceId: investigation.traceId,
          idempotencyKey: input.idempotencyKey,
          hash,
        });
      }

      const createdAt = now(this.dependencies.clock);
      const parsedResult = HumanReviewEscalationResultSchema.parse({
        schemaVersion: 1,
        disposition: "CREATED",
        reviewCaseId: this.dependencies.identifiers.nextReviewCaseId(),
        investigationId: investigation.investigationId,
        orderId: investigation.orderId,
        status: "AWAITING_REVIEW",
        queue: investigation.suggestedQueue,
        reasonCode,
        suggestedNextStep: investigation.suggestedNextStep,
        dedupeKey: `human-review:${investigation.investigationId}`,
        createdAt,
        updatedAt: createdAt,
        commerceStateChanged: false,
      });
      if (parsedResult.disposition !== "CREATED") {
        throw new WorkflowError("WORKFLOW_PERSISTENCE_FAILED");
      }
      const result = parsedResult as HumanReviewEscalationResult & {
        disposition: "CREATED";
      };
      try {
        const write =
          await this.dependencies.operations.persistCreatedReviewCase({
            result,
            traceId: investigation.traceId,
            auditEvents: buildReviewCaseAuditEvents({
              traceId: investigation.traceId,
              investigationId: investigation.investigationId,
              reviewCaseId: result.reviewCaseId,
              createdAt,
              keys: this.dependencies.identifiers,
              disposition: "CREATED",
              orderId: investigation.orderId,
              queue: result.queue,
              reasonCode: result.reasonCode,
            }),
            idempotencyKey: input.idempotencyKey,
            requestHash: hash,
          });
        if (write.kind === "COMMITTED") {
          return result;
        }
      } catch {
        // Resolve an ambiguous commit or a concurrent case below.
      }

      const postConflictReplay = await this.replayEscalationIdempotency(
        input.idempotencyKey,
        hash,
      );
      if (postConflictReplay) {
        return postConflictReplay;
      }
      const concurrentCase =
        await this.dependencies.operations.findReviewCaseByInvestigationId(
          investigation.investigationId,
        );
      if (!concurrentCase) {
        throw new WorkflowError("WORKFLOW_PERSISTENCE_FAILED");
      }
      const reused = this.reusedEscalationResult(concurrentCase);
      return await this.persistReuse({
        result: reused,
        traceId: investigation.traceId,
        idempotencyKey: input.idempotencyKey,
        hash,
      });
    } catch (error) {
      if (error instanceof WorkflowError) {
        throw error;
      }
      throw new WorkflowError("WORKFLOW_PERSISTENCE_FAILED");
    }
  }

  async getReviewCase(rawInput: GetReviewCaseInput): Promise<ReviewCaseResult> {
    const input = workflowInput(GetReviewCaseInputSchema, rawInput);
    try {
      const reviewCase = await this.dependencies.operations.findReviewCaseById(
        input.reviewCaseId,
      );
      if (!reviewCase) {
        throw new WorkflowError("REVIEW_CASE_NOT_FOUND");
      }
      const investigation =
        await this.dependencies.operations.findInvestigationById(
          reviewCase.investigationId,
        );
      if (!investigation) {
        throw new WorkflowError("INVALID_STORED_RESPONSE");
      }
      return ReviewCaseResultSchema.parse({
        schemaVersion: 1,
        reviewCase,
        investigation,
        commerceStateChanged: false,
      });
    } catch (error) {
      if (error instanceof WorkflowError) {
        throw error;
      }
      throw new WorkflowError("WORKFLOW_PERSISTENCE_FAILED");
    }
  }

  async getInvestigationTrace(
    rawInput: GetInvestigationTraceInput,
  ): Promise<InvestigationTrace> {
    const input = workflowInput(GetInvestigationTraceInputSchema, rawInput);
    try {
      const trace = await this.traceReader.getInvestigationTrace(
        input.investigationId,
      );
      if (!trace) {
        throw new WorkflowError("INVESTIGATION_NOT_FOUND");
      }
      return trace;
    } catch (error) {
      if (error instanceof WorkflowError) {
        throw error;
      }
      throw new WorkflowError("WORKFLOW_PERSISTENCE_FAILED");
    }
  }
}

export function createCommerceOperationsWorkflow(
  dependencies: CommerceOperationsWorkflowDependencies,
): CommerceOperationsWorkflow {
  return new DefaultCommerceOperationsWorkflow(dependencies);
}

export async function createCommerceOperationsWorkflowContext(): Promise<CommerceOperationsWorkflowContext> {
  const repositories = createWorkflowRepositoryContext();
  const workflow = createCommerceOperationsWorkflow({
    commerce: repositories.commerce,
    operations: repositories.operations,
    evidenceCollector: createEvidenceCollector({
      commerce: repositories.commerce,
      clock: demoEvidenceClock,
    }),
    readiness: createEvidenceReadinessEvaluator(),
    diagnosis: createDiagnosisEngine(),
    clock: systemClock,
    identifiers: runtimeIdentifiers,
  });
  return {
    workflow,
    disconnect: () => repositories.disconnect(),
  };
}
