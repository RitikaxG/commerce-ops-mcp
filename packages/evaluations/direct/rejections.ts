import assert from "node:assert/strict";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { getWorkflowDemoRecordCounts } from "@repo/db/testing";
import type { InvestigationWorkflowResult } from "@repo/schemas";

import {
  expectSafeMcpRejection,
  expectWorkflowMcpFailure,
} from "../assertions.js";
import {
  postMcpWithHost,
  type DirectMcpApiRuntime,
} from "../runtime.js";

export async function evaluateRejections(
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
