import assert from "node:assert/strict";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  getWorkflowDemoRecordCounts,
  resetWorkflowDemoData,
} from "@repo/db/testing";
import {
  approvedScenarioManifest,
  verifyApprovedDemoData,
} from "@repo/fixtures";
import { MCP_TOOL_NAMES } from "@repo/mcp";
import {
  CreateHumanReviewEscalationToolSuccessSchema,
  GetInvestigationTraceToolSuccessSchema,
  GetReviewCaseToolSuccessSchema,
  InvestigateOrderExceptionToolSuccessSchema,
  ListDemoCasesToolSuccessSchema,
  type HumanReviewEscalationResult,
  type InvestigationWorkflowResult,
} from "@repo/schemas";

import {
  assertWorkflowCounts,
  expectSafeMcpRejection,
  expectWorkflowMcpFailure,
  ZERO_WORKFLOW_COUNTS,
} from "./assertions.js";
import {
  DIRECT_MCP_CATEGORY_BY_ORDER_ID,
  DIRECT_MCP_FORBIDDEN_TOOL_NAMES,
  DIRECT_MCP_REASON_BY_ORDER_ID,
} from "./contracts.js";
import {
  postMcpWithHost,
  startDirectMcpApi,
  type DirectMcpApiRuntime,
} from "./runtime.js";

function expectedToolFields(name: string): string[] {
  switch (name) {
    case "list_demo_cases":
      return [];
    case "investigate_order_exception":
      return ["clientRequestId", "idempotencyKey", "orderId"];
    case "create_human_review_escalation":
      return ["idempotencyKey", "investigationId"];
    case "get_review_case":
      return ["reviewCaseId"];
    case "get_investigation_trace":
      return ["investigationId"];
    default:
      throw new Error(`Unexpected MCP tool: ${name}`);
  }
}

async function evaluateToolCatalog(client: Client): Promise<void> {
  const capabilities = client.getServerCapabilities();
  assert.ok(capabilities?.tools);
  assert.equal(capabilities?.resources, undefined);
  assert.equal(capabilities?.prompts, undefined);

  const listed = await client.listTools();
  assert.deepEqual(
    listed.tools.map(({ name }) => name),
    [...MCP_TOOL_NAMES],
  );

  const forbidden = new Set<string>(DIRECT_MCP_FORBIDDEN_TOOL_NAMES);
  for (const tool of listed.tools) {
    assert.equal(forbidden.has(tool.name), false);
    assert.ok(tool.description);
    assert.equal(tool.inputSchema.additionalProperties, false);
    assert.deepEqual(
      Object.keys(
        (tool.inputSchema.properties ?? {}) as Record<string, unknown>,
      ).sort(),
      expectedToolFields(tool.name),
    );
    assert.deepEqual(
      [...((tool.inputSchema.required ?? []) as string[])].sort(),
      expectedToolFields(tool.name),
    );
    assert.equal(
      tool.annotations?.readOnlyHint,
      [
        "list_demo_cases",
        "get_review_case",
        "get_investigation_trace",
      ].includes(tool.name),
    );
    assert.equal(tool.annotations?.destructiveHint, false);
    assert.equal(tool.annotations?.idempotentHint, true);
    assert.equal(tool.annotations?.openWorldHint, false);
  }

  const catalogCall = await client.callTool({
    name: "list_demo_cases",
    arguments: {},
  });
  assert.notEqual(catalogCall.isError, true);
  const catalog = ListDemoCasesToolSuccessSchema.parse(
    catalogCall.structuredContent,
  ).result;
  assert.equal(catalog.purpose, "DEMO_DISCOVERY_ONLY");
  assert.equal(catalog.commerceStateChanged, false);
  assert.deepEqual(
    catalog.cases.map(({ orderId }) => orderId),
    approvedScenarioManifest.map(({ orderId }) => orderId),
  );

  for (const [index, scenario] of approvedScenarioManifest.entries()) {
    const demoCase = catalog.cases[index];
    assert.ok(demoCase);
    assert.equal(demoCase.title, scenario.title);
    assert.equal(
      demoCase.category,
      DIRECT_MCP_CATEGORY_BY_ORDER_ID[
        scenario.orderId as keyof typeof DIRECT_MCP_CATEGORY_BY_ORDER_ID
      ],
    );
  }

  assert.deepEqual(
    await getWorkflowDemoRecordCounts(),
    ZERO_WORKFLOW_COUNTS,
  );
}

async function evaluateInvestigations(
  client: Client,
): Promise<Map<string, InvestigationWorkflowResult>> {
  const byOrderId = new Map<string, InvestigationWorkflowResult>();

  for (const scenario of approvedScenarioManifest) {
    const call = await client.callTool({
      name: "investigate_order_exception",
      arguments: {
        orderId: scenario.orderId,
        clientRequestId: `phase10-direct:${scenario.orderId}`,
        idempotencyKey: `phase10-direct:investigate:${scenario.orderId}`,
      },
    });
    assert.notEqual(call.isError, true);
    const result = InvestigateOrderExceptionToolSuccessSchema.parse(
      call.structuredContent,
    ).result;
    assert.equal(result.orderId, scenario.orderId);
    assert.equal(result.status, scenario.expectedInvestigationStatus);
    assert.equal(result.commerceStateChanged, false);

    if (result.status === "FAILED") {
      assert.fail(`${scenario.orderId} unexpectedly returned FAILED`);
    }

    assert.equal(
      result.decision.evidenceStatus,
      scenario.expectedEvidenceStatus,
    );
    assert.equal(result.decision.diagnosisCode, scenario.expectedDiagnosis);
    assert.equal(
      result.decision.shouldEscalate,
      scenario.shouldEscalate,
    );
    assert.equal(result.decision.suggestedQueue, scenario.expectedQueue);
    assert.equal(
      result.decision.suggestedNextStep,
      scenario.expectedSuggestedNextStep,
    );
    assert.equal(result.decision.commerceStateChanged, false);

    if (scenario.orderId === "ORD-1042") {
      assert.deepEqual(
        result.decision.eligibleAlternativeWarehouseIds,
        ["WH-B"],
      );
    }
    if (scenario.orderId === "ORD-1044") {
      assert.ok(
        result.decision.supportingFacts.some(({ code, value }) => {
          if (
            code !== "PROCESSING_WINDOW" ||
            typeof value !== "object" ||
            value === null ||
            Array.isArray(value)
          ) {
            return false;
          }
          return value.elapsedMinutes === 90 && value.windowMinutes === 240;
        }),
      );
    }
    if (scenario.orderId === "ORD-1046") {
      assert.equal(result.decision.diagnosisCode, null);
      assert.ok(
        result.decision.supportingFacts.some(
          ({ code, value }) =>
            code === "MISSING_EVIDENCE" &&
            Array.isArray(value) &&
            value.includes(
              "inventory.assignedWarehouse.WH-A.SKU-1046",
            ),
        ),
      );
    }
    if (scenario.orderId === "ORD-1050") {
      assert.equal(result.decision.diagnosisCode, null);
      assert.ok(
        result.decision.supportingFacts.some(
          ({ code, value }) =>
            code === "CONFLICTING_EVIDENCE" &&
            Array.isArray(value) &&
            value.some(
              (conflict) =>
                typeof conflict === "object" &&
                conflict !== null &&
                "path" in conflict &&
                conflict.path ===
                  "inventory.WH-A.SKU-1050.availableQuantity",
            ),
        ),
      );
    }

    byOrderId.set(scenario.orderId, result);
  }

  assertWorkflowCounts(await getWorkflowDemoRecordCounts(), {
    investigations: 9,
    investigationEvidence: 9,
    humanReviewEscalations: 0,
    idempotencyRecords: 9,
  });

  const first = byOrderId.get("ORD-1042");
  assert.ok(first);
  const beforeRetry = await getWorkflowDemoRecordCounts();
  const retry = await client.callTool({
    name: "investigate_order_exception",
    arguments: {
      orderId: "ORD-1042",
      clientRequestId: "phase10-direct:ORD-1042",
      idempotencyKey: "phase10-direct:investigate:ORD-1042",
    },
  });
  assert.deepEqual(
    InvestigateOrderExceptionToolSuccessSchema.parse(
      retry.structuredContent,
    ).result,
    first,
  );
  assert.deepEqual(await getWorkflowDemoRecordCounts(), beforeRetry);

  return byOrderId;
}

async function evaluateEscalations(
  client: Client,
  investigationByOrderId: ReadonlyMap<string, InvestigationWorkflowResult>,
): Promise<Map<string, HumanReviewEscalationResult>> {
  const byOrderId = new Map<string, HumanReviewEscalationResult>();

  for (const scenario of approvedScenarioManifest.filter(
    ({ shouldEscalate }) => shouldEscalate,
  )) {
    const investigation = investigationByOrderId.get(scenario.orderId);
    assert.ok(investigation);
    const call = await client.callTool({
      name: "create_human_review_escalation",
      arguments: {
        investigationId: investigation.investigationId,
        idempotencyKey: `phase10-direct:escalate:${scenario.orderId}`,
      },
    });
    assert.notEqual(call.isError, true);
    const result =
      CreateHumanReviewEscalationToolSuccessSchema.parse(
        call.structuredContent,
      ).result;
    assert.equal(result.disposition, "CREATED");
    assert.equal(result.investigationId, investigation.investigationId);
    assert.equal(result.orderId, scenario.orderId);
    assert.equal(result.queue, scenario.expectedQueue);
    assert.equal(
      result.reasonCode,
      DIRECT_MCP_REASON_BY_ORDER_ID[
        scenario.orderId as keyof typeof DIRECT_MCP_REASON_BY_ORDER_ID
      ],
    );
    assert.equal(
      result.suggestedNextStep,
      scenario.expectedSuggestedNextStep,
    );
    assert.equal(result.commerceStateChanged, false);
    byOrderId.set(scenario.orderId, result);
  }

  for (const orderId of ["ORD-1044", "ORD-1047"] as const) {
    const investigation = investigationByOrderId.get(orderId);
    assert.ok(investigation);
    await expectWorkflowMcpFailure(
      () =>
        client.callTool({
          name: "create_human_review_escalation",
          arguments: {
            investigationId: investigation.investigationId,
            idempotencyKey: `phase10-direct:escalate:${orderId}`,
          },
        }),
      "ESCALATION_NOT_ALLOWED",
    );
  }

  assertWorkflowCounts(await getWorkflowDemoRecordCounts(), {
    investigations: 9,
    investigationEvidence: 9,
    humanReviewEscalations: 7,
    idempotencyRecords: 16,
  });

  const first = byOrderId.get("ORD-1042");
  assert.ok(first);
  const beforeRetry = await getWorkflowDemoRecordCounts();
  const retry = await client.callTool({
    name: "create_human_review_escalation",
    arguments: {
      investigationId: first.investigationId,
      idempotencyKey: "phase10-direct:escalate:ORD-1042",
    },
  });
  assert.deepEqual(
    CreateHumanReviewEscalationToolSuccessSchema.parse(
      retry.structuredContent,
    ).result,
    first,
  );
  assert.deepEqual(await getWorkflowDemoRecordCounts(), beforeRetry);

  const beforeReuse = await getWorkflowDemoRecordCounts();
  const reuseCall = await client.callTool({
    name: "create_human_review_escalation",
    arguments: {
      investigationId: first.investigationId,
      idempotencyKey: "phase10-direct:escalate:ORD-1042:second-key",
    },
  });
  const reuse =
    CreateHumanReviewEscalationToolSuccessSchema.parse(
      reuseCall.structuredContent,
    ).result;
  assert.equal(reuse.disposition, "REUSED");
  assert.equal(reuse.reviewCaseId, first.reviewCaseId);

  const afterReuse = await getWorkflowDemoRecordCounts();
  assert.equal(afterReuse.humanReviewEscalations, 7);
  assert.equal(afterReuse.idempotencyRecords, 17);
  assert.equal(afterReuse.auditEvents, beforeReuse.auditEvents + 3);

  return byOrderId;
}

async function evaluateReads(
  client: Client,
  investigationByOrderId: ReadonlyMap<string, InvestigationWorkflowResult>,
  escalationByOrderId: ReadonlyMap<string, HumanReviewEscalationResult>,
): Promise<void> {
  const investigation = investigationByOrderId.get("ORD-1042");
  const reviewCase = escalationByOrderId.get("ORD-1042");
  assert.ok(investigation);
  assert.ok(reviewCase);

  const before = await getWorkflowDemoRecordCounts();

  const caseCall = await client.callTool({
    name: "get_review_case",
    arguments: { reviewCaseId: reviewCase.reviewCaseId },
  });
  const caseResult = GetReviewCaseToolSuccessSchema.parse(
    caseCall.structuredContent,
  ).result;
  assert.equal(caseResult.reviewCase.reviewCaseId, reviewCase.reviewCaseId);
  assert.equal(
    caseResult.investigation.investigationId,
    investigation.investigationId,
  );

  const traceCall = await client.callTool({
    name: "get_investigation_trace",
    arguments: { investigationId: investigation.investigationId },
  });
  const trace = GetInvestigationTraceToolSuccessSchema.parse(
    traceCall.structuredContent,
  ).result;
  assert.equal(
    trace.investigation.investigationId,
    investigation.investigationId,
  );
  assert.equal(trace.evidence?.snapshot.orderId, "ORD-1042");
  assert.deepEqual(
    trace.auditEvents
      .filter(
        ({ toolName }) => toolName === "create_human_review_escalation",
      )
      .map(({ eventType }) => eventType),
    [
      "TOOL_CALL_STARTED",
      "HUMAN_REVIEW_CASE_CREATED",
      "TOOL_CALL_SUCCEEDED",
      "TOOL_CALL_STARTED",
      "HUMAN_REVIEW_CASE_REUSED",
      "TOOL_CALL_SUCCEEDED",
    ],
  );

  assert.deepEqual(await getWorkflowDemoRecordCounts(), before);
}

async function evaluateRejections(
  client: Client,
  runtime: DirectMcpApiRuntime,
  investigationByOrderId: ReadonlyMap<string, InvestigationWorkflowResult>,
): Promise<void> {
  const investigation1042 = investigationByOrderId.get("ORD-1042");
  const investigation1043 = investigationByOrderId.get("ORD-1043");
  assert.ok(investigation1042);
  assert.ok(investigation1043);

  const before = await getWorkflowDemoRecordCounts();

  await expectSafeMcpRejection(() =>
    client.callTool({
      name: "update_order",
      arguments: { orderId: "ORD-1042", status: "SHIPPED" },
    }),
  );
  await expectSafeMcpRejection(() =>
    client.callTool({
      name: "investigate_order_exception",
      arguments: {
        orderId: "ORD-1042",
        clientRequestId: "phase10-direct:invalid-extra",
        idempotencyKey: "phase10-direct:invalid-extra",
        diagnosis: "CAUSE_NOT_DETERMINED",
      },
    }),
  );
  await expectSafeMcpRejection(() =>
    client.callTool({
      name: "create_human_review_escalation",
      arguments: {
        investigationId: investigation1042.investigationId,
        idempotencyKey: "phase10-direct:invalid-escalation",
        queue: "PAYMENT_OPERATIONS",
        reasonCode: "PAYMENT_NOT_CONFIRMED",
        suggestedNextStep: "retry shipment",
      },
    }),
  );
  await expectSafeMcpRejection(() =>
    client.callTool({
      name: "get_review_case",
      arguments: { reviewCaseId: "" },
    }),
  );

  await expectWorkflowMcpFailure(
    () =>
      client.callTool({
        name: "investigate_order_exception",
        arguments: {
          orderId: "ORD-1043",
          clientRequestId: "phase10-direct:different-input",
          idempotencyKey: "phase10-direct:investigate:ORD-1042",
        },
      }),
    "IDEMPOTENCY_KEY_REUSE",
  );
  await expectWorkflowMcpFailure(
    () =>
      client.callTool({
        name: "create_human_review_escalation",
        arguments: {
          investigationId: investigation1043.investigationId,
          idempotencyKey: "phase10-direct:escalate:ORD-1042",
        },
      }),
    "IDEMPOTENCY_KEY_REUSE",
  );
  await expectWorkflowMcpFailure(
    () =>
      client.callTool({
        name: "get_review_case",
        arguments: { reviewCaseId: "CASE-NOT-FOUND" },
      }),
    "REVIEW_CASE_NOT_FOUND",
  );
  await expectWorkflowMcpFailure(
    () =>
      client.callTool({
        name: "get_investigation_trace",
        arguments: { investigationId: "INV-NOT-FOUND" },
      }),
    "INVESTIGATION_NOT_FOUND",
  );

  const hostRejection = await postMcpWithHost(
    runtime.endpoint,
    "disallowed.example",
    {
      jsonrpc: "2.0",
      id: "invalid-host",
      method: "tools/list",
      params: {},
    },
  );
  assert.equal(hostRejection.status, 403);
  assert.deepEqual(hostRejection.body, {
    error: "MCP_HOST_NOT_ALLOWED",
  });

  assert.deepEqual(await getWorkflowDemoRecordCounts(), before);
}

async function run(): Promise<void> {
  await resetWorkflowDemoData();
  const initialDemo = await verifyApprovedDemoData();
  assert.deepEqual(initialDemo.summary.workflow, ZERO_WORKFLOW_COUNTS);

  let runtime: DirectMcpApiRuntime | undefined;
  let client: Client | undefined;

  try {
    runtime = await startDirectMcpApi();
    client = new Client({
      name: "commerce-operations-direct-evaluator",
      version: "1.0.0",
    });
    await client.connect(
      new StreamableHTTPClientTransport(runtime.endpoint),
    );

    await evaluateToolCatalog(client);
    const investigations = await evaluateInvestigations(client);
    const escalations = await evaluateEscalations(client, investigations);
    await evaluateReads(client, investigations, escalations);
    await evaluateRejections(client, runtime, investigations);

    const after = await verifyApprovedDemoData();
    assert.deepEqual(after.fixtures, initialDemo.fixtures);
    assert.deepEqual(after.summary.commerce, initialDemo.summary.commerce);

    console.log(
      JSON.stringify(
        {
          evaluation: "phase-10-direct-mcp",
          status: "PASS",
          sdk: "@modelcontextprotocol/sdk@1.30.0",
          transport: "Streamable HTTP",
          endpoint: "/mcp",
          tools: MCP_TOOL_NAMES,
          scenarios: approvedScenarioManifest.length,
          investigations: after.summary.workflow.investigations,
          reviewCases: after.summary.workflow.humanReviewEscalations,
          idempotencyRecords: after.summary.workflow.idempotencyRecords,
          commerceStateChanged: false,
        },
        null,
        2,
      ),
    );
  } finally {
    if (client) {
      await client.close().catch(() => undefined);
    }
    if (runtime) {
      await runtime.close().catch(() => undefined);
    }

    await resetWorkflowDemoData();
    const finalDemo = await verifyApprovedDemoData();
    assert.deepEqual(finalDemo.fixtures, initialDemo.fixtures);
    assert.deepEqual(finalDemo.summary.commerce, initialDemo.summary.commerce);
    assert.deepEqual(finalDemo.summary.workflow, ZERO_WORKFLOW_COUNTS);
  }
}

void run().catch((error) => {
  console.error(
    JSON.stringify({
      evaluation: "phase-10-direct-mcp",
      status: "FAIL",
      error: {
        name: error instanceof Error ? error.name : "UnknownError",
        message:
          "Direct MCP evaluation failed. Review the preceding command output.",
      },
    }),
  );
  process.exitCode = 1;
});
