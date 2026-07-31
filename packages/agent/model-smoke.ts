import {
  GeminiModelProvider,
  parseAgentRuntimeConfig,
  SafeModelProviderError,
} from "./index.js";

async function main(): Promise<void> {
  const config = parseAgentRuntimeConfig();
  const provider = new GeminiModelProvider(config.modelApiKey);
  try {
    await provider.verifyModel(config.model);
    console.log(
      JSON.stringify({
        check: "gemini-model-availability",
        status: "PASS",
        provider: config.provider,
        model: config.model,
      }),
    );
  } catch (error) {
    const code =
      error instanceof SafeModelProviderError
        ? error.code
        : "INVALID_PROVIDER_RESPONSE";
    console.error(
      JSON.stringify({
        check: "gemini-model-availability",
        status: "FAIL",
        provider: config.provider,
        model: config.model,
        errorCode: code,
      }),
    );
    process.exitCode = 1;
  }
}

void main();
