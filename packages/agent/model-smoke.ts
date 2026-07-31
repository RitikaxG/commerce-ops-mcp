import {
  GeminiModelProvider,
  parseModelRuntimeConfig,
  SafeModelProviderError,
  type AgentToolDefinition,
} from "./index.js";

const SMOKE_TOOL: AgentToolDefinition = {
  name: "smoke_check",
  description: "Verifies that Gemini function calling is available.",
  parametersJsonSchema: {
    type: "object",
    properties: {
      probe: { type: "string", const: "ok" },
    },
    required: ["probe"],
    additionalProperties: false,
  },
};

async function main(): Promise<void> {
  const config = parseModelRuntimeConfig();
  const provider = new GeminiModelProvider(config.modelApiKey, undefined, {
    ...(config.providerMinIntervalMs === undefined
      ? {}
      : { minIntervalMs: config.providerMinIntervalMs }),
    ...(config.providerMaxRetries === undefined
      ? {}
      : { maxRetries: config.providerMaxRetries }),
    ...(config.providerMaxRetryDelayMs === undefined
      ? {}
      : { maxRetryDelayMs: config.providerMaxRetryDelayMs }),
  });
  const sessionId = "gemini-model-smoke";
  try {
    await provider.verifyModel(config.model);
    const turn = await provider.generateToolTurn({
      sessionId,
      systemInstructions:
        "Call the only available function exactly once. Do not answer with text.",
      userMessage: "Call smoke_check with probe set to ok.",
      tools: [SMOKE_TOOL],
      generation: {
        model: config.model,
        maxOutputTokens: 128,
        thinkingLevel: "low",
        timeoutMs: 30_000,
      },
    });
    if (
      turn.kind !== "TOOL_CALLS" ||
      turn.calls.length !== 1 ||
      turn.calls[0]?.name !== "smoke_check" ||
      turn.calls[0].arguments.probe !== "ok"
    ) {
      throw new SafeModelProviderError("INVALID_PROVIDER_RESPONSE");
    }
    console.log(
      JSON.stringify({
        check: "gemini-function-calling",
        status: "PASS",
        provider: config.provider,
        model: config.model,
        totalTokens: turn.usage.totalTokens,
      }),
    );
  } catch (error) {
    const safe =
      error instanceof SafeModelProviderError
        ? error
        : new SafeModelProviderError("INVALID_PROVIDER_RESPONSE");
    console.error(
      JSON.stringify({
        check: "gemini-function-calling",
        status: "FAIL",
        provider: config.provider,
        model: config.model,
        errorCode: safe.code,
        retryAfterMs: safe.retryAfterMs,
      }),
    );
    process.exitCode = 1;
  } finally {
    provider.clearSession(sessionId);
  }
}

void main();
