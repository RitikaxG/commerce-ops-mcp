import { describe, expect, test } from "bun:test";
import type {
  AttachInvestigationIdempotencyCommand,
  AuditEventDraft,
  OperationsWorkflowRepository,
  PersistCreatedReviewCaseCommand,
  PersistInvestigationFailureCommand,
  PersistInvestigationSuccessCommand,
  PersistReusedReviewCaseCommand,
  StoredIdempotencyRecord,
} from "@repo/db";
import {
  createDiagnosisEngine,
  createEvidenceReadinessEvaluator,
} from "@repo/diagnosis";
import {
  EVIDENCE_SOURCE_NAMES,
  HumanReviewEscalationResultSchema,
  InvestigateOrderExceptionInputSchema,
  InvestigationWorkflowResultSchema,
  NormalizedOrderEvidenceSchema,
  type InvestigationWorkflowResult,
  type JsonValue,
  type NormalizedOrderEvidence,
  type PersistedInvestigationEvidence,
  type PersistedInvestigationSummary,
  type PersistedReviewCase,
  type SafeAuditEvent,
} from "@repo/schemas";

import {
  WorkflowError,
  createCommerceOperationsWorkflow,
  type CommerceOperationsWorkflowDependencies,
  type WorkflowIdentifierFactory,
} from "../index.js";

const AT = "2026-07-30T12:00:00.000Z";

function evidence(
  input: {
    orderId?: string;
    paymentStatus?: "SUCCEEDED" | "PROCESSING";
    shipmentExists?: boolean;
  } = {},
): NormalizedOrderEvidence {
  const orderId = input.orderId ?? "ORD-UNIT";
  const shipment = input.shipmentExists
    ? {
        id: "SHIP-UNIT",
        orderId,
        fulfilmentId: "FUL-UNIT",
        status: "CREATED" as const,
        providerReference: "SHIP-REF-UNIT",
        createdAt: AT,
        observedAt: AT,
      }
    : null;
  const counts = {
    ORDER: 1,
    ORDER_ITEMS: 1,
    PAYMENT: 1,
    FULFILMENT: 1,
    FULFILMENT_EVENTS: 0,
    SHIPMENT: shipment ? 1 : 0,
    INVENTORY: 1,
    WAREHOUSES: 1,
  };
  return NormalizedOrderEvidenceSchema.parse({
    schemaVersion: 1,
    orderId,
    collectedAt: AT,
    order: {
      id: orderId,
      status: "CONFIRMED",
      createdAt: AT,
      updatedAt: AT,
    },
    orderItems: [
      {
        id: "ITEM-UNIT",
        orderId,
        sku: "SKU-UNIT",
        quantity: 1,
        createdAt: AT,
      },
    ],
    payment: {
      id: "PAY-UNIT",
      orderId,
      status: input.paymentStatus ?? "SUCCEEDED",
      amount: "10.00",
      currency: "USD",
      providerReference: "PAY-REF-UNIT",
      observedAt: AT,
    },
    fulfilment: {
      id: "FUL-UNIT",
      orderId,
      status: "PENDING",
      holdReason: null,
      assignedWarehouseId: "WH-UNIT",
      providerReference: "FUL-REF-UNIT",
      createdAt: AT,
      updatedAt: AT,
      observedAt: AT,
    },
    fulfilmentEvents: [],
    shipment,
    inventoryObservations: [
      {
        warehouseId: "WH-UNIT",
        sku: "SKU-UNIT",
        sourceSystem: "WAREHOUSE_SYSTEM",
        availableQuantity: 2,
        observedAt: AT,
      },
    ],
    warehouses: [
      {
        id: "WH-UNIT",
        name: "Unit Warehouse",
        active: true,
        createdAt: AT,
      },
    ],
    sourceReads: EVIDENCE_SOURCE_NAMES.map((source) => ({
      source,
      status: "SUCCEEDED",
      readAt: AT,
      latestSourceTimestamp: counts[source] === 0 ? null : AT,
      recordCount: counts[source],
      errorCode: null,
    })),
  });
}

class MemoryOperationsRepository implements OperationsWorkflowRepository {
  readonly idempotency = new Map<string, StoredIdempotencyRecord>();
  readonly investigations = new Map<string, PersistedInvestigationSummary>();
  readonly clientRequests = new Map<string, string>();
  readonly evidence = new Map<string, PersistedInvestigationEvidence>();
  readonly cases = new Map<string, PersistedReviewCase>();
  readonly caseByInvestigation = new Map<string, string>();
  readonly audits: SafeAuditEvent[] = [];
  writes = 0;
  failStoredResponse = false;

  private key(tool: string, key: string) {
    return `${tool}\u0000${key}`;
  }

  private addAudits(events: AuditEventDraft[]) {
    for (const event of events) {
      this.audits.push({
        schemaVersion: 1,
        id: String(this.audits.length + 1),
        ...event,
      });
    }
  }

  private addIdempotency(input: {
    toolName: string;
    idempotencyKey: string;
    requestHash: string;
    resourceType: StoredIdempotencyRecord["resourceType"];
    resourceId: string;
    responseSnapshot: JsonValue;
    createdAt: string;
  }) {
    this.idempotency.set(this.key(input.toolName, input.idempotencyKey), input);
  }

  async findIdempotencyRecord(toolName: string, idempotencyKey: string) {
    const found =
      this.idempotency.get(this.key(toolName, idempotencyKey)) ?? null;
    return this.failStoredResponse && found
      ? { ...found, responseSnapshot: { invalid: true } }
      : found;
  }

  async findInvestigationById(investigationId: string) {
    return this.investigations.get(investigationId) ?? null;
  }

  async findInvestigationByClientRequestId(clientRequestId: string) {
    const id = this.clientRequests.get(clientRequestId);
    return id ? (this.investigations.get(id) ?? null) : null;
  }

  async findStoredInvestigationResponse(investigationId: string) {
    const record = [...this.idempotency.values()].find(
      ({ resourceType, resourceId }) =>
        resourceType === "INVESTIGATION" && resourceId === investigationId,
    );
    return record?.responseSnapshot ?? null;
  }

  async findEvidenceByInvestigationId(investigationId: string) {
    return this.evidence.get(investigationId) ?? null;
  }

  async findReviewCaseById(reviewCaseId: string) {
    return this.cases.get(reviewCaseId) ?? null;
  }

  async findReviewCaseByInvestigationId(investigationId: string) {
    const id = this.caseByInvestigation.get(investigationId);
    return id ? (this.cases.get(id) ?? null) : null;
  }

  async listAuditEventsForInvestigation(investigationId: string) {
    return this.audits.filter(
      (event) => event.investigationId === investigationId,
    );
  }

  async listAuditEventsForTrace(traceId: string) {
    return this.audits.filter((event) => event.traceId === traceId);
  }

  async persistInvestigationSuccess(
    command: PersistInvestigationSuccessCommand,
  ) {
    if (
      this.idempotency.has(
        this.key("investigate_order_exception", command.idempotencyKey),
      ) ||
      this.clientRequests.has(command.result.clientRequestId)
    ) {
      return { kind: "UNIQUE_CONFLICT" as const };
    }
    this.writes += 1;
    const { result } = command;
    this.investigations.set(result.investigationId, {
      schemaVersion: 1,
      investigationId: result.investigationId,
      traceId: result.traceId,
      orderId: result.orderId,
      clientRequestId: result.clientRequestId,
      status: result.status,
      evidenceStatus: result.decision.evidenceStatus,
      diagnosisCode: result.decision.diagnosisCode,
      confidence: result.decision.confidence,
      matchedRule: result.decision.matchedRule,
      suggestedQueue: result.decision.suggestedQueue,
      suggestedNextStep: result.decision.suggestedNextStep,
      errorCode: null,
      createdAt: result.createdAt,
      updatedAt: result.completedAt,
      completedAt: result.completedAt,
      commerceStateChanged: false,
    });
    this.clientRequests.set(result.clientRequestId, result.investigationId);
    this.evidence.set(result.investigationId, command.evidence);
    this.addAudits(command.auditEvents);
    this.addIdempotency({
      toolName: "investigate_order_exception",
      idempotencyKey: command.idempotencyKey,
      requestHash: command.requestHash,
      resourceType: "INVESTIGATION",
      resourceId: result.investigationId,
      responseSnapshot: structuredClone(result) as JsonValue,
      createdAt: result.completedAt,
    });
    return { kind: "COMMITTED" as const };
  }

  async persistInvestigationFailure(
    command: PersistInvestigationFailureCommand,
  ) {
    if (
      this.idempotency.has(
        this.key("investigate_order_exception", command.idempotencyKey),
      ) ||
      this.clientRequests.has(command.result.clientRequestId)
    ) {
      return { kind: "UNIQUE_CONFLICT" as const };
    }
    this.writes += 1;
    const { result } = command;
    this.investigations.set(result.investigationId, {
      schemaVersion: 1,
      investigationId: result.investigationId,
      traceId: result.traceId,
      orderId: result.orderId,
      clientRequestId: result.clientRequestId,
      status: "FAILED",
      evidenceStatus: null,
      diagnosisCode: null,
      confidence: null,
      matchedRule: null,
      suggestedQueue: null,
      suggestedNextStep: null,
      errorCode: result.errorCode,
      createdAt: result.createdAt,
      updatedAt: result.completedAt,
      completedAt: result.completedAt,
      commerceStateChanged: false,
    });
    this.clientRequests.set(result.clientRequestId, result.investigationId);
    this.addAudits(command.auditEvents);
    this.addIdempotency({
      toolName: "investigate_order_exception",
      idempotencyKey: command.idempotencyKey,
      requestHash: command.requestHash,
      resourceType: "INVESTIGATION",
      resourceId: result.investigationId,
      responseSnapshot: structuredClone(result) as JsonValue,
      createdAt: result.completedAt,
    });
    return { kind: "COMMITTED" as const };
  }

  async attachInvestigationIdempotency(
    command: AttachInvestigationIdempotencyCommand,
  ) {
    const key = this.key("investigate_order_exception", command.idempotencyKey);
    if (this.idempotency.has(key)) {
      return { kind: "UNIQUE_CONFLICT" as const };
    }
    this.writes += 1;
    this.addIdempotency({
      toolName: "investigate_order_exception",
      idempotencyKey: command.idempotencyKey,
      requestHash: command.requestHash,
      resourceType: "INVESTIGATION",
      resourceId: command.result.investigationId,
      responseSnapshot: structuredClone(command.result) as JsonValue,
      createdAt: command.createdAt,
    });
    return { kind: "COMMITTED" as const };
  }

  async persistCreatedReviewCase(command: PersistCreatedReviewCaseCommand) {
    const key = this.key(
      "create_human_review_escalation",
      command.idempotencyKey,
    );
    if (
      this.idempotency.has(key) ||
      this.caseByInvestigation.has(command.result.investigationId)
    ) {
      return { kind: "UNIQUE_CONFLICT" as const };
    }
    this.writes += 1;
    const { result } = command;
    const reviewCase: PersistedReviewCase = {
      schemaVersion: 1,
      reviewCaseId: result.reviewCaseId,
      investigationId: result.investigationId,
      orderId: result.orderId,
      status: result.status,
      queue: result.queue,
      reasonCode: result.reasonCode,
      suggestedNextStep: result.suggestedNextStep,
      dedupeKey: result.dedupeKey,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
      closedAt: null,
    };
    this.cases.set(result.reviewCaseId, reviewCase);
    this.caseByInvestigation.set(result.investigationId, result.reviewCaseId);
    this.addAudits(command.auditEvents);
    this.addIdempotency({
      toolName: "create_human_review_escalation",
      idempotencyKey: command.idempotencyKey,
      requestHash: command.requestHash,
      resourceType: "HUMAN_REVIEW_ESCALATION",
      resourceId: result.reviewCaseId,
      responseSnapshot: structuredClone(result) as JsonValue,
      createdAt: result.createdAt,
    });
    return { kind: "COMMITTED" as const };
  }

  async persistReusedReviewCase(command: PersistReusedReviewCaseCommand) {
    const key = this.key(
      "create_human_review_escalation",
      command.idempotencyKey,
    );
    if (this.idempotency.has(key)) {
      return { kind: "UNIQUE_CONFLICT" as const };
    }
    this.writes += 1;
    this.addAudits(command.auditEvents);
    this.addIdempotency({
      toolName: "create_human_review_escalation",
      idempotencyKey: command.idempotencyKey,
      requestHash: command.requestHash,
      resourceType: "HUMAN_REVIEW_ESCALATION",
      resourceId: command.result.reviewCaseId,
      responseSnapshot: structuredClone(command.result) as JsonValue,
      createdAt: command.persistedAt,
    });
    return { kind: "COMMITTED" as const };
  }
}

function identifiers(): WorkflowIdentifierFactory {
  let investigation = 0;
  let trace = 0;
  let reviewCase = 0;
  let audit = 0;
  return {
    nextInvestigationId: () => `INV-UNIT-${++investigation}`,
    nextTraceId: () => `TRACE-UNIT-${++trace}`,
    nextReviewCaseId: () => `CASE-UNIT-${++reviewCase}`,
    nextAuditEventKey: () => `AUDIT-UNIT-${++audit}`,
  };
}

function setup(
  input: {
    snapshot?: NormalizedOrderEvidence;
    collectorError?: Error;
    order?: "FOUND" | "NOT_FOUND" | "FAILED";
  } = {},
) {
  const operations = new MemoryOperationsRepository();
  const orderState = input.order ?? "FOUND";
  const snapshot = input.snapshot ?? evidence();
  const dependencies: CommerceOperationsWorkflowDependencies = {
    commerce: {
      findOrderById: async (orderId) => {
        if (orderState === "FAILED") {
          throw new Error("raw database password=secret");
        }
        return orderState === "NOT_FOUND"
          ? null
          : {
              id: orderId,
              status: "CONFIRMED",
              createdAt: AT,
              updatedAt: AT,
            };
      },
      listOrderItemsForOrder: async () => [],
      findCurrentPaymentForOrder: async () => null,
      findCurrentFulfilmentForOrder: async () => null,
      listFulfilmentEventsForOrder: async () => [],
      findCurrentShipmentForOrder: async () => null,
      listInventoryObservationsForSkus: async () => [],
      listWarehousesByIds: async () => [],
    },
    operations,
    evidenceCollector: {
      collect: async () => {
        if (input.collectorError) {
          throw input.collectorError;
        }
        return snapshot;
      },
    },
    readiness: createEvidenceReadinessEvaluator(),
    diagnosis: createDiagnosisEngine(),
    clock: { now: () => new Date(AT) },
    identifiers: identifiers(),
  };
  return {
    operations,
    workflow: createCommerceOperationsWorkflow(dependencies),
  };
}

const investigationInput = {
  orderId: "ORD-UNIT",
  clientRequestId: "REQ-UNIT-1",
  idempotencyKey: "IDEM-UNIT-1",
};

function expectWorkflowCode(error: unknown, code: WorkflowError["code"]) {
  expect(error).toBeInstanceOf(WorkflowError);
  expect((error as WorkflowError).code).toBe(code);
  expect((error as Error).message).not.toContain("secret");
}

async function expectWorkflowError(
  operation: Promise<unknown>,
  code: WorkflowError["code"],
): Promise<void> {
  try {
    await operation;
  } catch (error) {
    expectWorkflowCode(error, code);
    return;
  }
  throw new Error(`Expected workflow error ${code}`);
}

describe("persistent investigation workflow", () => {
  test("persists one terminal investigation bundle and does not create a case", async () => {
    const { workflow, operations } = setup();
    const result = await workflow.investigateOrderException(investigationInput);

    expect(InvestigationWorkflowResultSchema.parse(result)).toEqual(result);
    expect(result.status).toBe("COMPLETED");
    expect(operations.investigations.size).toBe(1);
    expect(operations.evidence.size).toBe(1);
    expect(operations.idempotency.size).toBe(1);
    expect(operations.cases.size).toBe(0);
    expect(operations.audits.map(({ eventType }) => eventType)).toContain(
      "INVESTIGATION_PERSISTED",
    );
    expect(result.commerceStateChanged).toBeFalse();
  });

  test("replays an exact idempotency result without writes or audit events", async () => {
    const { workflow, operations } = setup();
    const first = await workflow.investigateOrderException(investigationInput);
    const writes = operations.writes;
    const audits = operations.audits.length;
    const second = await workflow.investigateOrderException(investigationInput);

    expect(second).toEqual(first);
    expect(operations.writes).toBe(writes);
    expect(operations.audits).toHaveLength(audits);

    await expectWorkflowError(
      workflow.investigateOrderException({
        ...investigationInput,
        orderId: "ORD-DIFFERENT",
      }),
      "IDEMPOTENCY_KEY_REUSE",
    );
  });

  test("reuses a client request for the same order and rejects another order", async () => {
    const { workflow, operations } = setup();
    const first = await workflow.investigateOrderException(investigationInput);
    const second = await workflow.investigateOrderException({
      ...investigationInput,
      idempotencyKey: "IDEM-UNIT-2",
    });

    expect(second).toEqual(first);
    expect(operations.investigations.size).toBe(1);
    expect(operations.idempotency.size).toBe(2);

    await expectWorkflowError(
      workflow.investigateOrderException({
        orderId: "ORD-OTHER",
        clientRequestId: investigationInput.clientRequestId,
        idempotencyKey: "IDEM-UNIT-3",
      }),
      "CLIENT_REQUEST_ID_REUSE",
    );
  });

  test("does not persist when the order anchor is absent or unavailable", async () => {
    for (const [order, code] of [
      ["NOT_FOUND", "ORDER_NOT_FOUND"],
      ["FAILED", "ORDER_SOURCE_UNAVAILABLE"],
    ] as const) {
      const { workflow, operations } = setup({ order });
      await expectWorkflowError(
        workflow.investigateOrderException(investigationInput),
        code,
      );
      expect(operations.writes).toBe(0);
    }
  });

  test("persists a safe FAILED outcome after an anchored technical failure", async () => {
    const { workflow, operations } = setup({
      collectorError: new Error("postgres://user:secret@host/raw-table"),
    });
    const result = await workflow.investigateOrderException(investigationInput);

    expect(result.status).toBe("FAILED");
    expect(operations.evidence.size).toBe(0);
    expect(operations.investigations.values().next().value).toMatchObject({
      status: "FAILED",
      evidenceStatus: null,
      diagnosisCode: null,
      errorCode: "WORKFLOW_EXECUTION_FAILED",
    });
    expect(JSON.stringify([...operations.audits.values()])).not.toContain(
      "secret",
    );
  });

  test("maps an unrecoverable persistence failure without leaking internals", async () => {
    const { workflow, operations } = setup();
    operations.persistInvestigationSuccess = async () => {
      throw new Error("postgres://owner:secret@internal-host");
    };
    operations.persistInvestigationFailure = async () => {
      throw new Error("relation operations.raw_table does not exist");
    };

    await expectWorkflowError(
      workflow.investigateOrderException(investigationInput),
      "WORKFLOW_PERSISTENCE_FAILED",
    );
    expect(operations.investigations.size).toBe(0);
  });

  test("rejects invalid inputs and invalid stored responses safely", async () => {
    expect(
      InvestigateOrderExceptionInputSchema.safeParse({
        ...investigationInput,
        evidence: {},
      }).success,
    ).toBeFalse();
    const { workflow, operations } = setup();
    await workflow.investigateOrderException(investigationInput);
    operations.failStoredResponse = true;
    await expectWorkflowError(
      workflow.investigateOrderException(investigationInput),
      "INVALID_STORED_RESPONSE",
    );
  });
});

describe("persistent human-review workflow and queries", () => {
  test("creates, exactly replays, and then reuses one review case", async () => {
    const { workflow, operations } = setup({
      snapshot: evidence({ paymentStatus: "PROCESSING" }),
    });
    const investigation =
      await workflow.investigateOrderException(investigationInput);
    const created = await workflow.createHumanReviewEscalation({
      investigationId: investigation.investigationId,
      idempotencyKey: "CASE-IDEM-1",
    });
    const auditCount = operations.audits.length;
    const exactReplay = await workflow.createHumanReviewEscalation({
      investigationId: investigation.investigationId,
      idempotencyKey: "CASE-IDEM-1",
    });
    const reused = await workflow.createHumanReviewEscalation({
      investigationId: investigation.investigationId,
      idempotencyKey: "CASE-IDEM-2",
    });

    expect(HumanReviewEscalationResultSchema.parse(created)).toEqual(created);
    expect(created.disposition).toBe("CREATED");
    expect(exactReplay).toEqual(created);
    expect(reused).toMatchObject({
      disposition: "REUSED",
      reviewCaseId: created.reviewCaseId,
      investigationId: created.investigationId,
    });
    expect(operations.cases.size).toBe(1);
    expect(
      operations.audits
        .slice(auditCount)
        .filter(({ eventType }) => eventType === "HUMAN_REVIEW_CASE_REUSED"),
    ).toHaveLength(1);
  });

  test("rejects a terminal outcome that needs no human action", async () => {
    const { workflow } = setup({
      snapshot: evidence({ shipmentExists: true }),
    });
    const investigation =
      await workflow.investigateOrderException(investigationInput);
    await expectWorkflowError(
      workflow.createHumanReviewEscalation({
        investigationId: investigation.investigationId,
        idempotencyKey: "CASE-INELIGIBLE",
      }),
      "ESCALATION_NOT_ALLOWED",
    );
  });

  test("returns case and trace without adding writes or audit events", async () => {
    const { workflow, operations } = setup({
      snapshot: evidence({ paymentStatus: "PROCESSING" }),
    });
    const investigation =
      await workflow.investigateOrderException(investigationInput);
    const escalation = await workflow.createHumanReviewEscalation({
      investigationId: investigation.investigationId,
      idempotencyKey: "CASE-QUERY",
    });
    const writes = operations.writes;
    const auditCount = operations.audits.length;

    const reviewCase = await workflow.getReviewCase({
      reviewCaseId: escalation.reviewCaseId,
    });
    const trace = await workflow.getInvestigationTrace({
      investigationId: investigation.investigationId,
    });

    expect(reviewCase.reviewCase.reviewCaseId).toBe(escalation.reviewCaseId);
    expect(trace.investigation.investigationId).toBe(
      investigation.investigationId,
    );
    expect(trace.evidence?.snapshot.orderId).toBe(investigation.orderId);
    expect(operations.writes).toBe(writes);
    expect(operations.audits).toHaveLength(auditCount);
  });
});
