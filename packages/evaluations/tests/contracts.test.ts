import { expect, test } from "bun:test";
import { approvedScenarioManifest } from "@repo/fixtures";
import { MCP_TOOL_NAMES } from "@repo/mcp";

import {
  DIRECT_MCP_CATEGORY_BY_ORDER_ID,
  DIRECT_MCP_FORBIDDEN_TOOL_NAMES,
  DIRECT_MCP_REASON_BY_ORDER_ID,
} from "../contracts.js";

test("direct MCP evaluation contracts cover the frozen scenario manifest", () => {
  expect(Object.keys(DIRECT_MCP_CATEGORY_BY_ORDER_ID)).toEqual(
    approvedScenarioManifest.map(({ orderId }) => orderId),
  );

  const escalationOrderIds = approvedScenarioManifest
    .filter(({ shouldEscalate }) => shouldEscalate)
    .map(({ orderId }) => orderId);
  expect(Object.keys(DIRECT_MCP_REASON_BY_ORDER_ID)).toEqual(
    escalationOrderIds,
  );

  const forbidden = new Set<string>(DIRECT_MCP_FORBIDDEN_TOOL_NAMES);
  for (const name of MCP_TOOL_NAMES) {
    expect(forbidden.has(name)).toBeFalse();
  }
});
