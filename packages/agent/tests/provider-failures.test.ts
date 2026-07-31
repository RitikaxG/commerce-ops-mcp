import { describe, expect, test } from "bun:test";

import {
  SafeModelProviderError,
  createCommerceOperationsAgent,
  type AgentMcpClient,
  type AgentRuntimeConfig,
  type ModelProvider,
} from "../index.js";

function config(): AgentRuntimeConfig {
  return {
    provider: "gemini",
    model: "gemini-3.6-flash",
    modelApiKey: "unit-test-placeholder",
    mcpServerUrl: new URL("http://127.0.0.1:3000/mcp"),
    maxToolSteps: 4,
    providerTimeoutMs: 30_000,
    mcpTimeoutMs: 15_000,
  };
}

function providerFailure(error: SafeModelProviderError): ModelProvider {
  return {
    verifyModel: async () => undefined,
    generateToolTurn: async () => {
      throw error;
    },
    generateExplanation: async () => {
      throw error;
    },
    clearSession: () => undefined,
  };
}

function unusedMcpClient(): AgentMcpClient {
  return {
    toolNames: [
      "list_demo_cases",
      "investigate_order_exception",
      "create_human_review_escalation",
      "get_review_case",
      "get_investigation_trace",
    ],
    callTool: async () => {
      throw new Error("MCP must not be called after a provider failure");
    },
    close: async () => undefined,
  };
}

describe("safe model-provider failures", () => {
  test("returns quota exhaustion explicitly without calling MCP", async () => {
    const agent = createCommerceOperationsAgent({
      config: config(),
      provider: providerFailure(
        new SafeModelProviderError("QUOTA_EXHAUSTED"),
      ),
      connectMcp: async () => unusedMcpClient(),
    });

    const result = await agent.run({ message: "Investigate ORD-1042" });

    expect(result.outcome).toBe("SAFE_ERROR");
    expect(result.toolTrace).toEqual([]);
    expect(result.message).toContain("quota is exhausted");
    expect(result.commerceStateChanged).toBeFalse();
  });

  test("returns the bounded retry delay for rate limiting", async () => {
    const agent = createCommerceOperationsAgent({
      config: config(),
      provider: providerFailure(
        new SafeModelProviderError("RATE_LIMITED", {
          retryAfterMs: 46_659,
        }),
      ),
      connectMcp: async () => unusedMcpClient(),
    });

    const result = await agent.run({ message: "Investigate ORD-1042" });

    expect(result.outcome).toBe("SAFE_ERROR");
    expect(result.message).toContain("47 seconds");
    expect(result.toolTrace).toEqual([]);
  });
});
