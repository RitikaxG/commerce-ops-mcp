import {
  PersistedInvestigationEvidenceSchema,
  PersistedInvestigationSummarySchema,
  PersistedReviewCaseSchema,
  SafeAuditEventSchema,
  type HumanReviewEscalationResult,
  type InvestigationWorkflowFailure,
  type InvestigationWorkflowSuccess,
  type JsonValue,
  type PersistedInvestigationEvidence,
  type PersistedInvestigationSummary,
  type PersistedReviewCase,
  type SafeAuditEvent,
} from "@repo/schemas";

import { Prisma, type PrismaClient } from "./generated/prisma/client.js";

export const INVESTIGATION_TOOL_NAME = "investigate_order_exception";
export const ESCALATION_TOOL_NAME = "create_human_review_escalation";

export type AuditEventDraft = Omit<SafeAuditEvent, "schemaVersion" | "id">;

export interface StoredIdempotencyRecord {
  toolName: string;
  idempotencyKey: string;
  requestHash: string;
  resourceType: "INVESTIGATION" | "HUMAN_REVIEW_ESCALATION";
  resourceId: string;
  responseSnapshot: JsonValue;
  createdAt: string;
}

export interface AtomicWriteOutcome {
  kind: "COMMITTED" | "UNIQUE_CONFLICT";
}

export interface PersistInvestigationSuccessCommand {
  result: InvestigationWorkflowSuccess;
  evidence: PersistedInvestigationEvidence;
  auditEvents: AuditEventDraft[];
  idempotencyKey: string;
  requestHash: string;
}

export interface PersistInvestigationFailureCommand {
  result: InvestigationWorkflowFailure;
  auditEvents: AuditEventDraft[];
  idempotencyKey: string;
  requestHash: string;
}

export interface AttachInvestigationIdempotencyCommand {
  result: InvestigationWorkflowSuccess | InvestigationWorkflowFailure;
  idempotencyKey: string;
  requestHash: string;
  createdAt: string;
}

export interface PersistCreatedReviewCaseCommand {
  result: HumanReviewEscalationResult & { disposition: "CREATED" };
  traceId: string;
  auditEvents: AuditEventDraft[];
  idempotencyKey: string;
  requestHash: string;
}

export interface PersistReusedReviewCaseCommand {
  result: HumanReviewEscalationResult & { disposition: "REUSED" };
  traceId: string;
  auditEvents: AuditEventDraft[];
  idempotencyKey: string;
  requestHash: string;
  persistedAt: string;
}

export interface OperationsWorkflowRepository {
  findIdempotencyRecord(
    toolName: string,
    idempotencyKey: string,
  ): Promise<StoredIdempotencyRecord | null>;
  findInvestigationById(
    investigationId: string,
  ): Promise<PersistedInvestigationSummary | null>;
  findInvestigationByClientRequestId(
    clientRequestId: string,
  ): Promise<PersistedInvestigationSummary | null>;
  findStoredInvestigationResponse(
    investigationId: string,
  ): Promise<JsonValue | null>;
  findEvidenceByInvestigationId(
    investigationId: string,
  ): Promise<PersistedInvestigationEvidence | null>;
  findReviewCaseById(reviewCaseId: string): Promise<PersistedReviewCase | null>;
  findReviewCaseByInvestigationId(
    investigationId: string,
  ): Promise<PersistedReviewCase | null>;
  listAuditEventsForInvestigation(
    investigationId: string,
  ): Promise<SafeAuditEvent[]>;
  listAuditEventsForTrace(traceId: string): Promise<SafeAuditEvent[]>;
  persistInvestigationSuccess(
    command: PersistInvestigationSuccessCommand,
  ): Promise<AtomicWriteOutcome>;
  persistInvestigationFailure(
    command: PersistInvestigationFailureCommand,
  ): Promise<AtomicWriteOutcome>;
  attachInvestigationIdempotency(
    command: AttachInvestigationIdempotencyCommand,
  ): Promise<AtomicWriteOutcome>;
  persistCreatedReviewCase(
    command: PersistCreatedReviewCaseCommand,
  ): Promise<AtomicWriteOutcome>;
  persistReusedReviewCase(
    command: PersistReusedReviewCaseCommand,
  ): Promise<AtomicWriteOutcome>;
}

const investigationSelection = {
  id: true,
  traceId: true,
  orderId: true,
  clientRequestId: true,
  status: true,
  evidenceStatus: true,
  diagnosisCode: true,
  confidence: true,
  matchedRule: true,
  suggestedQueue: true,
  suggestedNextStep: true,
  errorCode: true,
  createdAt: true,
  updatedAt: true,
  completedAt: true,
} satisfies Prisma.InvestigationSelect;

const evidenceSelection = {
  investigationId: true,
  snapshotSchemaVersion: true,
  snapshot: true,
  missingFields: true,
  conflicts: true,
  sourceObservedAt: true,
  createdAt: true,
} satisfies Prisma.InvestigationEvidenceSelect;

const reviewCaseSelection = {
  id: true,
  investigationId: true,
  orderId: true,
  status: true,
  queue: true,
  reasonCode: true,
  suggestedNextStep: true,
  dedupeKey: true,
  createdAt: true,
  updatedAt: true,
  closedAt: true,
} satisfies Prisma.HumanReviewEscalationSelect;

const auditEventSelection = {
  id: true,
  eventKey: true,
  traceId: true,
  investigationId: true,
  escalationId: true,
  eventType: true,
  toolName: true,
  status: true,
  safeInputSummary: true,
  safeOutputSummary: true,
  errorCode: true,
  durationMs: true,
  createdAt: true,
} satisfies Prisma.AuditEventSelect;

type InvestigationRow = Prisma.InvestigationGetPayload<{
  select: typeof investigationSelection;
}>;
type EvidenceRow = Prisma.InvestigationEvidenceGetPayload<{
  select: typeof evidenceSelection;
}>;
type ReviewCaseRow = Prisma.HumanReviewEscalationGetPayload<{
  select: typeof reviewCaseSelection;
}>;
type AuditEventRow = Prisma.AuditEventGetPayload<{
  select: typeof auditEventSelection;
}>;

function timestamp(value: Date): string {
  return value.toISOString();
}

function jsonInput(value: JsonValue): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function nullableJsonInput(
  value: JsonValue | null,
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === null ? Prisma.DbNull : jsonInput(value);
}

function mapInvestigation(
  row: InvestigationRow,
): PersistedInvestigationSummary {
  return PersistedInvestigationSummarySchema.parse({
    schemaVersion: 1,
    investigationId: row.id,
    traceId: row.traceId,
    orderId: row.orderId,
    clientRequestId: row.clientRequestId,
    status: row.status,
    evidenceStatus: row.evidenceStatus,
    diagnosisCode: row.diagnosisCode,
    confidence: row.confidence,
    matchedRule: row.matchedRule,
    suggestedQueue: row.suggestedQueue,
    suggestedNextStep: row.suggestedNextStep,
    errorCode: row.errorCode,
    createdAt: timestamp(row.createdAt),
    updatedAt: timestamp(row.updatedAt),
    completedAt: row.completedAt ? timestamp(row.completedAt) : null,
    commerceStateChanged: false,
  });
}

function mapEvidence(row: EvidenceRow): PersistedInvestigationEvidence {
  return PersistedInvestigationEvidenceSchema.parse({
    schemaVersion: 1,
    investigationId: row.investigationId,
    snapshotSchemaVersion: row.snapshotSchemaVersion,
    snapshot: row.snapshot,
    missingFields: row.missingFields,
    conflicts: row.conflicts,
    sourceObservedAt: row.sourceObservedAt,
    createdAt: timestamp(row.createdAt),
  });
}

function mapReviewCase(row: ReviewCaseRow): PersistedReviewCase {
  return PersistedReviewCaseSchema.parse({
    schemaVersion: 1,
    reviewCaseId: row.id,
    investigationId: row.investigationId,
    orderId: row.orderId,
    status: row.status,
    queue: row.queue,
    reasonCode: row.reasonCode,
    suggestedNextStep: row.suggestedNextStep,
    dedupeKey: row.dedupeKey,
    createdAt: timestamp(row.createdAt),
    updatedAt: timestamp(row.updatedAt),
    closedAt: row.closedAt ? timestamp(row.closedAt) : null,
  });
}

function mapAuditEvent(row: AuditEventRow): SafeAuditEvent {
  return SafeAuditEventSchema.parse({
    schemaVersion: 1,
    id: row.id.toString(),
    eventKey: row.eventKey,
    traceId: row.traceId,
    investigationId: row.investigationId,
    reviewCaseId: row.escalationId,
    eventType: row.eventType,
    toolName: row.toolName,
    status: row.status,
    safeInputSummary: row.safeInputSummary,
    safeOutputSummary: row.safeOutputSummary,
    errorCode: row.errorCode,
    durationMs: row.durationMs,
    createdAt: timestamp(row.createdAt),
  });
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

function auditData(event: AuditEventDraft): Prisma.AuditEventCreateManyInput {
  return {
    eventKey: event.eventKey,
    traceId: event.traceId,
    investigationId: event.investigationId,
    escalationId: event.reviewCaseId,
    eventType: event.eventType,
    toolName: event.toolName,
    status: event.status,
    safeInputSummary: nullableJsonInput(event.safeInputSummary),
    safeOutputSummary: nullableJsonInput(event.safeOutputSummary),
    errorCode: event.errorCode,
    durationMs: event.durationMs,
    createdAt: event.createdAt,
  };
}

async function expectedAtomicWrite(
  operation: () => Promise<void>,
): Promise<AtomicWriteOutcome> {
  try {
    await operation();
    return { kind: "COMMITTED" };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { kind: "UNIQUE_CONFLICT" };
    }
    throw error;
  }
}

class PrismaOperationsWorkflowRepository implements OperationsWorkflowRepository {
  constructor(private readonly database: PrismaClient) {}

  async findIdempotencyRecord(
    toolName: string,
    idempotencyKey: string,
  ): Promise<StoredIdempotencyRecord | null> {
    const row = await this.database.idempotencyRecord.findUnique({
      where: { toolName_idempotencyKey: { toolName, idempotencyKey } },
    });
    if (!row) {
      return null;
    }
    return {
      ...row,
      responseSnapshot: row.responseSnapshot as JsonValue,
      createdAt: timestamp(row.createdAt),
    };
  }

  async findInvestigationById(
    investigationId: string,
  ): Promise<PersistedInvestigationSummary | null> {
    const row = await this.database.investigation.findUnique({
      where: { id: investigationId },
      select: investigationSelection,
    });
    return row ? mapInvestigation(row) : null;
  }

  async findInvestigationByClientRequestId(
    clientRequestId: string,
  ): Promise<PersistedInvestigationSummary | null> {
    const row = await this.database.investigation.findUnique({
      where: { clientRequestId },
      select: investigationSelection,
    });
    return row ? mapInvestigation(row) : null;
  }

  async findStoredInvestigationResponse(
    investigationId: string,
  ): Promise<JsonValue | null> {
    const row = await this.database.idempotencyRecord.findFirst({
      where: {
        resourceType: "INVESTIGATION",
        resourceId: investigationId,
      },
      orderBy: [{ createdAt: "asc" }, { idempotencyKey: "asc" }],
      select: { responseSnapshot: true },
    });
    return (row?.responseSnapshot as JsonValue | undefined) ?? null;
  }

  async findEvidenceByInvestigationId(
    investigationId: string,
  ): Promise<PersistedInvestigationEvidence | null> {
    const row = await this.database.investigationEvidence.findUnique({
      where: { investigationId },
      select: evidenceSelection,
    });
    return row ? mapEvidence(row) : null;
  }

  async findReviewCaseById(
    reviewCaseId: string,
  ): Promise<PersistedReviewCase | null> {
    const row = await this.database.humanReviewEscalation.findUnique({
      where: { id: reviewCaseId },
      select: reviewCaseSelection,
    });
    return row ? mapReviewCase(row) : null;
  }

  async findReviewCaseByInvestigationId(
    investigationId: string,
  ): Promise<PersistedReviewCase | null> {
    const row = await this.database.humanReviewEscalation.findUnique({
      where: { investigationId },
      select: reviewCaseSelection,
    });
    return row ? mapReviewCase(row) : null;
  }

  async listAuditEventsForInvestigation(
    investigationId: string,
  ): Promise<SafeAuditEvent[]> {
    const rows = await this.database.auditEvent.findMany({
      where: { investigationId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: auditEventSelection,
    });
    return rows.map(mapAuditEvent);
  }

  async listAuditEventsForTrace(traceId: string): Promise<SafeAuditEvent[]> {
    const rows = await this.database.auditEvent.findMany({
      where: { traceId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: auditEventSelection,
    });
    return rows.map(mapAuditEvent);
  }

  async persistInvestigationSuccess(
    command: PersistInvestigationSuccessCommand,
  ): Promise<AtomicWriteOutcome> {
    const { result, evidence } = command;
    return expectedAtomicWrite(async () => {
      await this.database.$transaction(async (transaction) => {
        await transaction.investigation.create({
          data: {
            id: result.investigationId,
            traceId: result.traceId,
            orderId: result.orderId,
            clientRequestId: result.clientRequestId,
            status: "RUNNING",
            createdAt: result.createdAt,
            updatedAt: result.createdAt,
          },
        });
        await transaction.investigationEvidence.create({
          data: {
            investigationId: result.investigationId,
            snapshotSchemaVersion: evidence.snapshotSchemaVersion,
            snapshot: jsonInput(evidence.snapshot),
            missingFields: evidence.missingFields,
            conflicts: jsonInput(evidence.conflicts),
            sourceObservedAt: jsonInput(evidence.sourceObservedAt),
            createdAt: evidence.createdAt,
          },
        });
        await transaction.investigation.update({
          where: { id: result.investigationId },
          data: {
            status: result.status,
            evidenceStatus: result.decision.evidenceStatus,
            diagnosisCode: result.decision.diagnosisCode,
            confidence: result.decision.confidence,
            matchedRule: result.decision.matchedRule,
            suggestedQueue: result.decision.suggestedQueue,
            suggestedNextStep: result.decision.suggestedNextStep,
            errorCode: null,
            updatedAt: result.completedAt,
            completedAt: result.completedAt,
          },
        });
        await transaction.auditEvent.createMany({
          data: command.auditEvents.map(auditData),
        });
        await transaction.idempotencyRecord.create({
          data: {
            toolName: INVESTIGATION_TOOL_NAME,
            idempotencyKey: command.idempotencyKey,
            requestHash: command.requestHash,
            resourceType: "INVESTIGATION",
            resourceId: result.investigationId,
            responseSnapshot: jsonInput(result),
            createdAt: result.completedAt,
          },
        });
      });
    });
  }

  async persistInvestigationFailure(
    command: PersistInvestigationFailureCommand,
  ): Promise<AtomicWriteOutcome> {
    const { result } = command;
    return expectedAtomicWrite(async () => {
      await this.database.$transaction(async (transaction) => {
        await transaction.investigation.create({
          data: {
            id: result.investigationId,
            traceId: result.traceId,
            orderId: result.orderId,
            clientRequestId: result.clientRequestId,
            status: "FAILED",
            errorCode: result.errorCode,
            createdAt: result.createdAt,
            updatedAt: result.completedAt,
            completedAt: result.completedAt,
          },
        });
        await transaction.auditEvent.createMany({
          data: command.auditEvents.map(auditData),
        });
        await transaction.idempotencyRecord.create({
          data: {
            toolName: INVESTIGATION_TOOL_NAME,
            idempotencyKey: command.idempotencyKey,
            requestHash: command.requestHash,
            resourceType: "INVESTIGATION",
            resourceId: result.investigationId,
            responseSnapshot: jsonInput(result),
            createdAt: result.completedAt,
          },
        });
      });
    });
  }

  async attachInvestigationIdempotency(
    command: AttachInvestigationIdempotencyCommand,
  ): Promise<AtomicWriteOutcome> {
    return expectedAtomicWrite(async () => {
      await this.database.idempotencyRecord.create({
        data: {
          toolName: INVESTIGATION_TOOL_NAME,
          idempotencyKey: command.idempotencyKey,
          requestHash: command.requestHash,
          resourceType: "INVESTIGATION",
          resourceId: command.result.investigationId,
          responseSnapshot: jsonInput(command.result),
          createdAt: command.createdAt,
        },
      });
    });
  }

  async persistCreatedReviewCase(
    command: PersistCreatedReviewCaseCommand,
  ): Promise<AtomicWriteOutcome> {
    const { result } = command;
    return expectedAtomicWrite(async () => {
      await this.database.$transaction(async (transaction) => {
        await transaction.humanReviewEscalation.create({
          data: {
            id: result.reviewCaseId,
            investigationId: result.investigationId,
            orderId: result.orderId,
            status: result.status,
            queue: result.queue,
            reasonCode: result.reasonCode,
            suggestedNextStep: result.suggestedNextStep,
            dedupeKey: result.dedupeKey,
            createdAt: result.createdAt,
            updatedAt: result.updatedAt,
          },
        });
        await transaction.auditEvent.createMany({
          data: command.auditEvents.map(auditData),
        });
        await transaction.idempotencyRecord.create({
          data: {
            toolName: ESCALATION_TOOL_NAME,
            idempotencyKey: command.idempotencyKey,
            requestHash: command.requestHash,
            resourceType: "HUMAN_REVIEW_ESCALATION",
            resourceId: result.reviewCaseId,
            responseSnapshot: jsonInput(result),
            createdAt: result.createdAt,
          },
        });
      });
    });
  }

  async persistReusedReviewCase(
    command: PersistReusedReviewCaseCommand,
  ): Promise<AtomicWriteOutcome> {
    const { result } = command;
    return expectedAtomicWrite(async () => {
      await this.database.$transaction(async (transaction) => {
        await transaction.auditEvent.createMany({
          data: command.auditEvents.map(auditData),
        });
        await transaction.idempotencyRecord.create({
          data: {
            toolName: ESCALATION_TOOL_NAME,
            idempotencyKey: command.idempotencyKey,
            requestHash: command.requestHash,
            resourceType: "HUMAN_REVIEW_ESCALATION",
            resourceId: result.reviewCaseId,
            responseSnapshot: jsonInput(result),
            createdAt: command.persistedAt,
          },
        });
      });
    });
  }
}

export function createOperationsWorkflowRepository(
  database: PrismaClient,
): OperationsWorkflowRepository {
  return new PrismaOperationsWorkflowRepository(database);
}
