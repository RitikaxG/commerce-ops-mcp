import assert from "node:assert/strict";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { getWorkflowDemoRecordCounts } from "@repo/db/testing";
import { approvedScenarioManifest } from "@repo/fixtures";
import { MCP_TOOL_NAMES } from "@repo/mcp";
import { ListDemoCasesToolSuccessSchema } from "@repo/schemas";

import { ZERO_WORKFLOW_COUNTS } from "../assertions.js";
import {
  DIRECT_MCP_CATEGORY_BY_ORDER_ID,
  DIRECT_MCP_FORBIDDEN_TOOL_NAMES,
} from "../contracts.js";

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

export async function evaluateToolCatalog(client: Client): Promise<void> {
  const capabilities = client.getServerCapabilities();
  assert.ok(capabilities?.tools);
  assert.equal(capabilities.resources, undefined);
  assert.equal(capabilities.prompts, undefined);

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
