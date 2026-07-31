import {
  createCommerceOperationsAgent,
  GeminiModelProvider,
  parseAgentRuntimeConfig,
} from "./index.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const debug = args.includes("--debug");
  const message = args.filter((value) => value !== "--debug").join(" ").trim();
  if (!message) {
    throw new Error("Usage: agent:ask [--debug] <message>");
  }

  const config = parseAgentRuntimeConfig();
  const provider = new GeminiModelProvider(config.modelApiKey);
  const agent = createCommerceOperationsAgent({ config, provider });
  const result = await agent.run({ message });
  console.log(result.message);
  if (debug) {
    console.log(
      JSON.stringify(
        {
          outcome: result.outcome,
          tools: result.toolTrace.map(({ toolName }) => toolName),
          investigationId: result.investigationId,
          reviewCaseId: result.reviewCaseId,
          model: result.usage.model,
          totalTokens: result.usage.totalTokens,
          commerceStateChanged: result.commerceStateChanged,
        },
        null,
        2,
      ),
    );
  }
  if (result.outcome === "SAFE_ERROR") {
    process.exitCode = 1;
  }
}

main().catch(() => {
  console.error("The AI host could not start safely.");
  process.exitCode = 1;
});
