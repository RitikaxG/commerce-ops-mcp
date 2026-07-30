import assert from "node:assert/strict";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { resetWorkflowDemoData } from "@repo/db/testing";
import {
  approvedScenarioManifest,
  verifyApprovedDemoData,
} from "@repo/fixtures";
import { MCP_TOOL_NAMES } from "@repo/mcp";

import { ZERO_WORKFLOW_COUNTS } from "../assertions.js";
import {
  startDirectMcpApi,
  type DirectMcpApiRuntime,
} from "../runtime.js";
import { evaluateToolCatalog } from "./catalog.js";
import { evaluateEscalations } from "./escalations.js";
import { evaluateInvestigations } from "./investigations.js";
import { evaluateReads } from "./reads.js";
import { evaluateRejections } from "./rejections.js";

export async function runDirectMcpEvaluation(): Promise<void> {
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
