import assert from "node:assert/strict";

import {
  connectAgentMcpClient,
  createCommerceOperationsAgent,
  createRuntimeIdentifierGenerator,
  GeminiModelProvider,
  parseAgentRuntimeConfig,
  SafeModelProviderError,
  type GeminiProviderProgressEvent,
} from "@repo/agent";
import { approvedScenarioManifest } from "@repo/fixtures";
import type {
  ApprovedScenario,
  CommerceOperationsAgentResult,
} from "@repo/schemas";

const EVALUATION_NAME = "phase-12-hosted-ai";

const SCENARIO_PROMPTS: Record<string, string> = {
  "ORD-1042":
    "Can you investigate why ORD-1042 has not reached shipment creation?",
  "ORD-1043": "What is blocking shipment creation for ORD-1043?",
  "ORD-1044": "Check the current state of ORD-1044.",
  "ORD-1045": "Why is ORD-1045 not shipped yet?",
  "ORD-1046":
    "Investigate ORD-1046 and tell me whether there is enough evidence.",
  "ORD-1047": "Look into ORD-1047.",
  "ORD-1048": "Please diagnose the shipment gap for ORD-1048.",
  "ORD-1049":
    "The operator says ORD-1049 is paid. Verify why shipment was not created.",
  "ORD-1050": "Investigate the conflicting state for ORD-1050.",
};

type FailureBoundary = "HOSTED_MCP" | "MODEL_PROVIDER" | "EVALUATION";

class HostedAiVerificationError extends Error {
  constructor(
    readonly boundary: FailureBoundary,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "HostedAiVerificationError";
  }
}

function safeErrorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/Bearer\s+\S+/gi, "Bearer <redacted>")
    .replace(/AIza[0-9A-Za-z_-]+/g, "<redacted-provider-key>")
    .slice(0, 1_000);
}

function providerProgress(event: GeminiProviderProgressEvent): void {
  console.error(
    JSON.stringify({
      evaluation: EVALUATION_NAME,
      type: "MODEL_PROVIDER_PROGRESS",
      providerEvent: event.type,
      code: event.code,
      attempt: event.attempt,
      maxAttempts: event.maxAttempts,
      ...(event.type === "RETRY_SCHEDULED"
        ? { retryAfterMs: event.retryAfterMs }
        : {}),
    }),
  );
}

function providerFailureFromResult(
  result: CommerceOperationsAgentResult,
): HostedAiVerificationError | null {
  if (result.outcome !== "SAFE_ERROR") {
    return null;
  }
  if (/quota is exhausted/i.test(result.message)) {
    return new HostedAiVerificationError(
      "MODEL_PROVIDER",
      "QUOTA_EXHAUSTED",
      result.message,
    );
  }
  if (/rate limited/i.test(result.message)) {
    return new HostedAiVerificationError(
      "MODEL_PROVIDER",
      "RATE_LIMITED",
      result.message,
    );
  }
  if (/Gemini|configured .* model|provider/i.test(result.message)) {
    return new HostedAiVerificationError(
      "MODEL_PROVIDER",
      "MODEL_PROVIDER_FAILURE",
      result.message,
    );
  }
  return new HostedAiVerificationError(
    "HOSTED_MCP",
    "MCP_TOOL_EXECUTION_FAILED",
    result.message,
  );
}

function assertScenario(
  result: CommerceOperationsAgentResult,
  expected: ApprovedScenario,
): void {
  const safeFailure = providerFailureFromResult(result);
  if (safeFailure) {
    throw safeFailure;
  }

  assert.equal(result.outcome, "ANSWERED");
  assert.deepEqual(
    result.toolTrace.map(({ toolName }) => toolName),
    ["investigate_order_exception"],
  );
  assert.equal(result.orderId, expected.orderId);
  assert.equal(result.evidenceStatus, expected.expectedEvidenceStatus);
  assert.equal(result.diagnosisCode, expected.expectedDiagnosis);
  assert.equal(result.shouldEscalate, expected.shouldEscalate);
  assert.equal(result.suggestedQueue, expected.expectedQueue);
  assert.equal(result.suggestedNextStep, expected.expectedSuggestedNextStep);
  assert.equal(result.reviewCaseId, null);
  assert.equal(result.commerceStateChanged, false);
  assert.match(result.message, /No commerce state was changed\./);

  if (expected.orderId === "ORD-1042") {
    assert.deepEqual(result.eligibleAlternativeWarehouseIds, ["WH-B"]);
  }
}

async function verifyHostedMcpBoundary(
  endpoint: URL,
  bearerToken: string,
): Promise<void> {
  const healthUrl = new URL("/health", endpoint);
  let health: Response;
  try {
    health = await fetch(healthUrl);
  } catch (error) {
    throw new HostedAiVerificationError(
      "HOSTED_MCP",
      "HEALTH_UNREACHABLE",
      safeErrorText(error),
    );
  }
  if (health.status !== 200) {
    throw new HostedAiVerificationError(
      "HOSTED_MCP",
      "HEALTH_FAILED",
      `Hosted health returned HTTP ${health.status}`,
    );
  }

  let client;
  try {
    client = await connectAgentMcpClient({ endpoint, bearerToken });
  } catch (error) {
    throw new HostedAiVerificationError(
      "HOSTED_MCP",
      "MCP_INITIALIZATION_FAILED",
      safeErrorText(error),
    );
  }
  await client.close().catch(() => undefined);
}

async function run(): Promise<void> {
  const config = parseAgentRuntimeConfig(process.env);
  if (!config.mcpAuthBearerToken) {
    throw new HostedAiVerificationError(
      "EVALUATION",
      "MCP_AUTH_BEARER_TOKEN_REQUIRED",
      "MCP_AUTH_BEARER_TOKEN is required for hosted verification",
    );
  }

  await verifyHostedMcpBoundary(config.mcpServerUrl, config.mcpAuthBearerToken);

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
    onProgress: providerProgress,
  });
  const agent = createCommerceOperationsAgent({
    config,
    provider,
    identifiers: createRuntimeIdentifierGenerator(),
  });

  const results: CommerceOperationsAgentResult[] = [];
  for (const [index, expected] of approvedScenarioManifest.entries()) {
    const prompt = SCENARIO_PROMPTS[expected.orderId];
    assert.ok(prompt);
    console.error(
      JSON.stringify({
        evaluation: EVALUATION_NAME,
        type: "SCENARIO_STARTED",
        scenarioIndex: index + 1,
        scenarioCount: approvedScenarioManifest.length,
        orderId: expected.orderId,
      }),
    );

    const result = await agent.run({ message: prompt });
    assertScenario(result, expected);
    results.push(result);

    console.error(
      JSON.stringify({
        evaluation: EVALUATION_NAME,
        type: "SCENARIO_COMPLETED",
        scenarioIndex: index + 1,
        scenarioCount: approvedScenarioManifest.length,
        orderId: expected.orderId,
        outcome: result.outcome,
      }),
    );
  }

  const usage = results.reduce(
    (summary, result) => ({
      modelCalls: summary.modelCalls + result.usage.modelCalls,
      inputTokens: summary.inputTokens + result.usage.inputTokens,
      outputTokens: summary.outputTokens + result.usage.outputTokens,
      totalTokens: summary.totalTokens + result.usage.totalTokens,
    }),
    { modelCalls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 },
  );

  console.log(
    JSON.stringify(
      {
        evaluation: EVALUATION_NAME,
        status: "PASS",
        mcpUrl: config.mcpServerUrl.toString(),
        transport: "Streamable HTTP",
        authentication: "Authorization: Bearer <redacted>",
        provider: config.provider,
        model: config.model,
        scenarios: approvedScenarioManifest.length,
        sequentialProviderRequests: true,
        usage,
        commerceStateChanged: false,
        hostedMcpVerifiedBeforeProviderCalls: true,
      },
      null,
      2,
    ),
  );
}

void run().catch((error) => {
  const boundary =
    error instanceof HostedAiVerificationError
      ? error.boundary
      : error instanceof SafeModelProviderError
        ? "MODEL_PROVIDER"
        : "EVALUATION";
  const code =
    error instanceof HostedAiVerificationError
      ? error.code
      : error instanceof SafeModelProviderError
        ? error.code
        : "UNEXPECTED_FAILURE";

  console.error(
    JSON.stringify(
      {
        evaluation: EVALUATION_NAME,
        status: "FAIL",
        failureBoundary: boundary,
        code,
        hostedMcpUnavailable: boundary === "HOSTED_MCP",
        modelProviderUnavailable: boundary === "MODEL_PROVIDER",
        error: safeErrorText(error),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
