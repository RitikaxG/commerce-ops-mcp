import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { approvedScenarioManifest } from "@repo/fixtures";
import { MCP_TOOL_NAMES } from "@repo/mcp";
import {
  CreateHumanReviewEscalationToolSuccessSchema,
  GetInvestigationTraceToolSuccessSchema,
  GetReviewCaseToolSuccessSchema,
  InvestigateOrderExceptionToolSuccessSchema,
  ListDemoCasesToolSuccessSchema,
} from "@repo/schemas";

const EVALUATION_NAME = "phase-12-hosted-mcp";

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function endpointFromEnvironment(): URL {
  const endpoint = new URL(requiredEnvironment("MCP_SERVER_URL"));
  if (!["http:", "https:"].includes(endpoint.protocol)) {
    throw new Error("MCP_SERVER_URL must use HTTP or HTTPS");
  }
  if (!endpoint.pathname.endsWith("/mcp")) {
    throw new Error("MCP_SERVER_URL must end in /mcp");
  }
  return endpoint;
}

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

function safeErrorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/Bearer\s+\S+/gi, "Bearer <redacted>")
    .slice(0, 1_000);
}

function responseText(value: unknown): string {
  if (
    typeof value === "object" &&
    value !== null &&
    "content" in value &&
    Array.isArray(value.content)
  ) {
    return value.content
      .map((entry) =>
        typeof entry === "object" &&
        entry !== null &&
        "text" in entry &&
        typeof entry.text === "string"
          ? entry.text
          : "",
      )
      .join("\n");
  }
  return JSON.stringify(value);
}

async function expectSafeFailure(
  operation: () => Promise<unknown>,
  expectedCode?: string,
): Promise<void> {
  try {
    const response = await operation();
    if (
      typeof response === "object" &&
      response !== null &&
      "isError" in response &&
      response.isError === true
    ) {
      if (expectedCode) {
        assert.match(responseText(response), new RegExp(expectedCode));
      }
      return;
    }
    assert.fail("Expected the MCP request to fail safely");
  } catch (error) {
    if (expectedCode) {
      assert.match(safeErrorText(error), new RegExp(expectedCode));
    }
  }
}

async function run(): Promise<void> {
  const endpoint = endpointFromEnvironment();
  const bearerToken = requiredEnvironment("MCP_AUTH_BEARER_TOKEN");
  const healthUrl = new URL("/health", endpoint);

  const health = await fetch(healthUrl);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: "ok" });

  const client = new Client({
    name: "commerce-operations-hosted-evaluator",
    version: "1.0.0",
  });
  const transport = new StreamableHTTPClientTransport(endpoint, {
    requestInit: {
      headers: { Authorization: `Bearer ${bearerToken}` },
    },
  } as never);

  try {
    await client.connect(transport);

    const capabilities = client.getServerCapabilities();
    assert.ok(capabilities?.tools);
    assert.equal(capabilities.resources, undefined);
    assert.equal(capabilities.prompts, undefined);

    const listed = await client.listTools();
    assert.deepEqual(
      listed.tools.map(({ name }) => name),
      [...MCP_TOOL_NAMES],
    );
    assert.equal(listed.tools.length, 5);

    for (const tool of listed.tools) {
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
      assert.equal(tool.annotations?.destructiveHint, false);
      assert.equal(tool.annotations?.idempotentHint, true);
      assert.equal(tool.annotations?.openWorldHint, false);
    }

    const catalogCall = await client.callTool({
      name: "list_demo_cases",
      arguments: {},
    });
    const catalog = ListDemoCasesToolSuccessSchema.parse(
      catalogCall.structuredContent,
    ).result;
    assert.equal(catalog.commerceStateChanged, false);
    assert.deepEqual(
      catalog.cases.map(({ orderId }) => orderId),
      approvedScenarioManifest.map(({ orderId }) => orderId),
    );

    const runId = randomUUID();
    const investigationCall = await client.callTool({
      name: "investigate_order_exception",
      arguments: {
        orderId: "ORD-1042",
        clientRequestId: `phase12-hosted:${runId}`,
        idempotencyKey: `phase12-hosted:investigate:${runId}`,
      },
    });
    const investigation = InvestigateOrderExceptionToolSuccessSchema.parse(
      investigationCall.structuredContent,
    ).result;
    if (investigation.status === "FAILED") {
      throw new Error("Representative investigation unexpectedly failed");
    }
    assert.equal(investigation.orderId, "ORD-1042");
    assert.equal(
      investigation.decision.diagnosisCode,
      "ASSIGNED_WAREHOUSE_OUT_OF_STOCK",
    );
    assert.equal(investigation.decision.shouldEscalate, true);
    assert.equal(
      investigation.decision.suggestedQueue,
      "FULFILMENT_OPERATIONS",
    );
    assert.deepEqual(investigation.decision.eligibleAlternativeWarehouseIds, [
      "WH-B",
    ]);
    assert.equal(investigation.commerceStateChanged, false);
    assert.equal(investigation.decision.commerceStateChanged, false);

    const escalationCall = await client.callTool({
      name: "create_human_review_escalation",
      arguments: {
        investigationId: investigation.investigationId,
        idempotencyKey: `phase12-hosted:escalate:${runId}`,
      },
    });
    const escalation = CreateHumanReviewEscalationToolSuccessSchema.parse(
      escalationCall.structuredContent,
    ).result;
    assert.equal(escalation.investigationId, investigation.investigationId);
    assert.equal(escalation.orderId, "ORD-1042");
    assert.equal(escalation.queue, "FULFILMENT_OPERATIONS");
    assert.equal(escalation.commerceStateChanged, false);

    const reviewCall = await client.callTool({
      name: "get_review_case",
      arguments: { reviewCaseId: escalation.reviewCaseId },
    });
    const review = GetReviewCaseToolSuccessSchema.parse(
      reviewCall.structuredContent,
    ).result;
    assert.equal(review.reviewCase.reviewCaseId, escalation.reviewCaseId);
    assert.equal(
      review.investigation.investigationId,
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
    assert.ok(trace.auditEvents.length > 0);

    await expectSafeFailure(
      () =>
        client.callTool({
          name: "investigate_order_exception",
          arguments: {
            orderId: "ORD-9999",
            clientRequestId: `phase12-hosted:unknown:${runId}`,
            idempotencyKey: `phase12-hosted:unknown:${runId}`,
          },
        }),
      "ORDER_NOT_FOUND",
    );
    await expectSafeFailure(() =>
      client.callTool({
        name: "update_order",
        arguments: { orderId: "ORD-1042", status: "SHIPPED" },
      }),
    );

    console.log(
      JSON.stringify(
        {
          evaluation: EVALUATION_NAME,
          status: "PASS",
          healthUrl: healthUrl.toString(),
          mcpUrl: endpoint.toString(),
          transport: "Streamable HTTP",
          authentication: "Authorization: Bearer <redacted>",
          tools: MCP_TOOL_NAMES,
          scenarios: approvedScenarioManifest.length,
          representativeOrder: "ORD-1042",
          investigationId: investigation.investigationId,
          reviewCaseId: escalation.reviewCaseId,
          traceEvents: trace.auditEvents.length,
          commerceStateChanged: false,
          modelProviderRequired: false,
        },
        null,
        2,
      ),
    );
  } finally {
    await client.close().catch(() => undefined);
  }
}

void run().catch((error) => {
  console.error(
    JSON.stringify(
      {
        evaluation: EVALUATION_NAME,
        status: "FAIL",
        failureBoundary: "HOSTED_MCP",
        error: safeErrorText(error),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
