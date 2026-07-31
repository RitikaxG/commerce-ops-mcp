import { describe, expect, test } from "bun:test";

import { parseAgentRuntimeConfig, parseModelRuntimeConfig } from "../index.js";

const MODEL_ENV = {
  MODEL_PROVIDER: "gemini",
  MODEL_NAME: "gemini-3.6-flash",
  MODEL_API_KEY: "test-key",
};

describe("agent configuration", () => {
  test("model smoke configuration does not require an MCP URL", () => {
    expect(parseModelRuntimeConfig(MODEL_ENV)).toEqual({
      provider: "gemini",
      model: "gemini-3.6-flash",
      modelApiKey: "test-key",
      providerMinIntervalMs: 3_500,
      providerMaxRetries: 2,
      providerMaxRetryDelayMs: 60_000,
    });
  });

  test("full agent configuration still requires an MCP URL", () => {
    expect(() => parseAgentRuntimeConfig(MODEL_ENV)).toThrow();
  });

  test("full agent configuration parses a local Streamable HTTP endpoint", () => {
    const parsed = parseAgentRuntimeConfig({
      ...MODEL_ENV,
      MCP_SERVER_URL: "http://127.0.0.1:3000/mcp",
    });

    expect(parsed.mcpServerUrl.toString()).toBe("http://127.0.0.1:3000/mcp");
    expect(parsed.maxToolSteps).toBe(4);
    expect(parsed.providerTimeoutMs).toBe(30_000);
    expect(parsed.mcpTimeoutMs).toBe(15_000);
    expect(parsed.providerMinIntervalMs).toBe(3_500);
    expect(parsed.providerMaxRetries).toBe(2);
    expect(parsed.providerMaxRetryDelayMs).toBe(60_000);
  });

  test("provider pacing and retry settings can be tightened explicitly", () => {
    const parsed = parseModelRuntimeConfig({
      ...MODEL_ENV,
      AGENT_PROVIDER_MIN_INTERVAL_MS: "5000",
      AGENT_PROVIDER_MAX_RETRIES: "1",
      AGENT_PROVIDER_MAX_RETRY_DELAY_MS: "90000",
    });

    expect(parsed.providerMinIntervalMs).toBe(5_000);
    expect(parsed.providerMaxRetries).toBe(1);
    expect(parsed.providerMaxRetryDelayMs).toBe(90_000);
  });
});
