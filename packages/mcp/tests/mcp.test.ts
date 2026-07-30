import { describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  CreateHumanReviewEscalationToolSuccessSchema,
  GetInvestigationTraceToolSuccessSchema,
  GetReviewCaseToolSuccessSchema,
  InvestigateOrderExceptionToolSuccessSchema,
  ListDemoCasesResultSchema,
  ListDemoCasesToolSuccessSchema,
  McpToolFailureSchema,
  type CreateHumanReviewEscalationInput,
  type GetInvestigationTraceInput,
  type GetReviewCaseInput,
  type InvestigateOrderExceptionInput,
  type InvestigationTrace,
  type InvestigationWorkflowResult,
  type ReviewCaseResult,
} from "@repo/schemas";
import {
  WorkflowError,
  type CommerceOperationsWorkflow,
} from "@repo/workflow";

import {
  MCP_TOOL_NAMES,
  createCommerceOperationsMcpServer,
} from "../index.js";

const AT = "2026-07-30T12:00:00.000Z";
const decision = {
  schemaVersion: 1 as const,
  orderId: "ORD-1049",
  investigationStatus: "COMPLETED" as const,
  evidenceStatus: "COMPLETE" as const,
  diagnosisCode: "PAYMENT_NOT_CONFIRMED" as const,
  confidence: "CONFIRMED" as const,
  matchedRule: "payment_not_confirmed.v1" as const,
  shouldEscalate: true,
  suggestedQueue: "PAYMENT_OPERATIONS" as const,
  suggestedNextStep:
    "Review the authoritative payment source before treating the order as paid.",
  supportingFacts: [
    {
      code: "PAYMENT_STATUS" as const,
      path: "payment.status",
      value: "PROCESSING",
    },
  ],
  eligibleAlternativeWarehouseIds: [],
  commerceStateChanged: false as const,
};
const investigation: InvestigationWorkflowResult = {
  schemaVersion: 1,
  investigationId: "INV-UNIT",
  traceId: "TRACE-UNIT",
  clientRequestId: "REQ-UNIT",
  orderId: "ORD-1049",
  status: "COMPLETED",
  decision,
  evidenceSnapshotSchemaVersion: 1,
  createdAt: AT,
  completedAt: AT,
  commerceStateChanged: false,
};
const investigationSummary = {
  schemaVersion: 1 as const,
  investigationId: "INV-UNIT",
  traceId: "TRACE-UNIT",
  orderId: "ORD-1049",
  clientRequestId: "REQ-UNIT",
  status: "COMPLETED" as const,
  evidenceStatus: "COMPLETE" as const,
  diagnosisCode: "PAYMENT_NOT_CONFIRMED" as const,
  confidence: "CONFIRMED" as const,
  matchedRule: "payment_not_confirmed.v1",
  suggestedQueue: "PAYMENT_OPERATIONS" as const,
  suggestedNextStep:
    "Review the authoritative payment source before treating the order as paid.",
  errorCode: null,
  createdAt: AT,
  updatedAt: AT,
  completedAt: AT,
  commerceStateChanged: false as const,
};
const reviewCase = {
  schemaVersion: 1 as const,
  reviewCaseId: "CASE-UNIT",
  investigationId: "INV-UNIT",
  orderId: "ORD-1049",
  status: "AWAITING_REVIEW" as const,
  queue: "PAYMENT_OPERATIONS" as const,
  reasonCode: "PAYMENT_NOT_CONFIRMED" as const,
  suggestedNextStep:
    "Review the authoritative payment source before treating the order as paid.",
  dedupeKey: "human-review:INV-UNIT",
  createdAt: AT,
  updatedAt: AT,
  closedAt: null,
};
const caseResult: ReviewCaseResult = {
  schemaVersion: 1,
  reviewCase,
  investigation: investigationSummary,
  commerceStateChanged: false,
};
const traceResult: InvestigationTrace = {
  schemaVersion: 1,
  investigation: investigationSummary,
  evidence: null,
  auditEvents: [],
  commerceStateChanged: false,
};

const catalog = ListDemoCasesResultSchema.parse({
  schemaVersion: 1,
  purpose: "DEMO_DISCOVERY_ONLY",
  cases: [
    ["ORD-1042", "Inventory", "INVENTORY"],
    ["ORD-1043", "Fulfilment", "FULFILMENT"],
    ["ORD-1044", "Processing", "PROCESSING"],
    ["ORD-1045", "Shipping", "SHIPPING"],
    ["ORD-1046", "Missing evidence", "DATA_QUALITY"],
    ["ORD-1047", "Shipment", "SHIPMENT"],
    ["ORD-1048", "General", "GENERAL"],
    ["ORD-1049", "Payment", "PAYMENT"],
    ["ORD-1050", "Conflicting evidence", "DATA_QUALITY"],
  ].map(([orderId, title, category]) => ({ orderId, title, category })),
  commerceStateChanged: false,
});

class FakeWorkflow implements CommerceOperationsWorkflow {
  calls = {
    list: 0,
    investigate: 0,
    escalate: 0,
    case: 0,
    trace: 0,
  };
  nextError: Error | undefined;

  private failIfRequested() {
    const error = this.nextError;
    this.nextError = undefined;
    if (error) {
      throw error;
    }
  }

  async listDemoCases() {
    this.calls.list += 1;
    this.failIfRequested();
    return catalog;
  }

  async investigateOrderException(_input: InvestigateOrderExceptionInput) {
    this.calls.investigate += 1;
    this.failIfRequested();
    return investigation;
  }

  async createHumanReviewEscalation(
    _input: CreateHumanReviewEscalationInput,
  ) {
    this.calls.escalate += 1;
    this.failIfRequested();
    return {
      schemaVersion: 1 as const,
      disposition: "CREATED" as const,
      reviewCaseId: "CASE-UNIT",
      investigationId: "INV-UNIT",
      orderId: "ORD-1049",
      status: "AWAITING_REVIEW" as const,
      queue: "PAYMENT_OPERATIONS" as const,
      reasonCode: "PAYMENT_NOT_CONFIRMED" as const,
      suggestedNextStep:
        "Review the authoritative payment source before treating the order as paid.",
      dedupeKey: "human-review:INV-UNIT",
      createdAt: AT,
      updatedAt: AT,
      commerceStateChanged: false as const,
    };
  }

  async getReviewCase(_input: GetReviewCaseInput) {
    this.calls.case += 1;
    this.failIfRequested();
    return caseResult;
  }

  async getInvestigationTrace(_input: GetInvestigationTraceInput) {
    this.calls.trace += 1;
    this.failIfRequested();
    return traceResult;
  }
}

async function withClient(
  workflow: FakeWorkflow,
  operation: (client: Client) => Promise<void>,
) {
  const server = createCommerceOperationsMcpServer({ workflow });
  const client = new Client({ name: "phase-10-test", version: "1.0.0" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    await operation(client);
  } finally {
    await client.close();
    await server.close();
  }
}

describe("commerce operations MCP adapter", () => {
  test("registers exactly five strict tools with truthful annotations", async () => {
    await withClient(new FakeWorkflow(), async (client) => {
      const listed = await client.listTools();
      expect(listed.tools.map(({ name }) => name)).toEqual([
        ...MCP_TOOL_NAMES,
      ]);
      expect(listed.tools.every(({ description }) => Boolean(description))).toBe(
        true,
      );
      for (const tool of listed.tools) {
        expect(tool.inputSchema.additionalProperties).toBe(false);
        expect(tool.annotations).toMatchObject({
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        });
        expect(tool.annotations?.readOnlyHint).toBe(
          [
            "list_demo_cases",
            "get_review_case",
            "get_investigation_trace",
          ].includes(tool.name),
        );
      }
    });
  });

  test("dispatches each tool once and validates every success envelope", async () => {
    const workflow = new FakeWorkflow();
    await withClient(workflow, async (client) => {
      const list = await client.callTool({
        name: "list_demo_cases",
        arguments: {},
      });
      ListDemoCasesToolSuccessSchema.parse(list.structuredContent);

      const investigated = await client.callTool({
        name: "investigate_order_exception",
        arguments: {
          orderId: "ORD-1049",
          clientRequestId: "REQ-UNIT",
          idempotencyKey: "IDEM-UNIT",
        },
      });
      InvestigateOrderExceptionToolSuccessSchema.parse(
        investigated.structuredContent,
      );
      expect(workflow.calls.escalate).toBe(0);

      const escalated = await client.callTool({
        name: "create_human_review_escalation",
        arguments: {
          investigationId: "INV-UNIT",
          idempotencyKey: "CASE-IDEM-UNIT",
        },
      });
      CreateHumanReviewEscalationToolSuccessSchema.parse(
        escalated.structuredContent,
      );

      const review = await client.callTool({
        name: "get_review_case",
        arguments: { reviewCaseId: "CASE-UNIT" },
      });
      GetReviewCaseToolSuccessSchema.parse(review.structuredContent);

      const trace = await client.callTool({
        name: "get_investigation_trace",
        arguments: { investigationId: "INV-UNIT" },
      });
      GetInvestigationTraceToolSuccessSchema.parse(trace.structuredContent);

      for (const result of [list, investigated, escalated, review, trace]) {
        expect(result.isError).not.toBe(true);
        if (!Array.isArray(result.content)) {
          throw new Error("Expected MCP content to be an array");
        }
        expect(result.content).toHaveLength(1);
        expect(result.content[0]?.type).toBe("text");
      }
    });
    expect(workflow.calls).toEqual({
      list: 1,
      investigate: 1,
      escalate: 1,
      case: 1,
      trace: 1,
    });
  });

  test("maps workflow and unexpected failures to finite safe envelopes", async () => {
    const workflow = new FakeWorkflow();
    await withClient(workflow, async (client) => {
      workflow.nextError = new WorkflowError("ORDER_NOT_FOUND");
      const expected = await client.callTool({
        name: "investigate_order_exception",
        arguments: {
          orderId: "ORD-UNKNOWN",
          clientRequestId: "REQ-MISSING",
          idempotencyKey: "IDEM-MISSING",
        },
      });
      expect(expected.isError).toBe(true);
      expect(McpToolFailureSchema.parse(expected.structuredContent)).toMatchObject(
        {
          error: {
            code: "ORDER_NOT_FOUND",
            message: "The requested order was not found.",
          },
          commerceStateChanged: false,
        },
      );

      workflow.nextError = new Error(
        "postgresql://secret@host/database should never escape",
      );
      const unexpected = await client.callTool({
        name: "get_review_case",
        arguments: { reviewCaseId: "CASE-UNIT" },
      });
      const failure = McpToolFailureSchema.parse(
        unexpected.structuredContent,
      );
      expect(failure.error).toEqual({
        code: "INTERNAL_ERROR",
        message: "The tool could not complete safely.",
      });
      expect(JSON.stringify(unexpected)).not.toContain("postgresql://");
    });
  });

  test("rejects extra or caller-controlled business fields before dispatch", async () => {
    const workflow = new FakeWorkflow();
    await withClient(workflow, async (client) => {
      for (const request of [
        {
          name: "investigate_order_exception",
          arguments: {
            orderId: "ORD-1049",
            clientRequestId: "REQ-EXTRA",
            idempotencyKey: "IDEM-EXTRA",
            diagnosis: "CAUSE_NOT_DETERMINED",
          },
        },
        {
          name: "create_human_review_escalation",
          arguments: {
            investigationId: "INV-UNIT",
            idempotencyKey: "CASE-EXTRA",
            queue: "PAYMENT_OPERATIONS",
            suggestedNextStep: "retry shipment",
          },
        },
      ]) {
        const result = await client.callTool(request);
        expect(result.isError).toBe(true);
      }
    });
    expect(workflow.calls.investigate).toBe(0);
    expect(workflow.calls.escalate).toBe(0);
  });
});
