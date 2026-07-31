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
  const startedAt = Date.now();

  console.error(
    "[smoke] Sending one Gemini function-calling request. The first attempt starts immediately.",
  );

  const progressTimer = setInterval(() => {
    const elapsedSeconds = Math.max(
      1,
      Math.floor((Date.now() - startedAt) / 1_000),
    );
    console.error(
      `[smoke] Still waiting after ${elapsedSeconds}s. Gemini may be processing the request or the provider may be honoring a retry delay.`,
    );
  }, 10_000);

  try {
    // A successful function-calling request proves both model access and the
    // capability needed by the agent. Avoid a separate model-metadata request
    // so the smoke check consumes only one initial Gemini request.
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
    clearInterval(progressTimer);
    provider.clearSession(sessionId);
  }
}

void main();
