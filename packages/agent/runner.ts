import {
  ApprovedAgentToolNameSchema,
  CommerceOperationsAgentRequestSchema,
  CommerceOperationsAgentResultSchema,
  type AgentUsageSummary,
  type CommerceOperationsAgentRequest,
  type CommerceOperationsAgentResult,
} from "@repo/schemas";

import type { AgentRuntimeConfig } from "./config.js";
import {
  createRuntimeIdentifierGenerator,
  type AgentIdentifierGenerator,
} from "./identifier-generator.js";
import { preflightIntent } from "./intent.js";
import type { ModelProvider } from "./provider.js";
import {
  assembleGroundedMessage,
  createEmptyAuthoritativeState,
  isSuccessfulMcpOutput,
  projectMcpResult,
  validateGroundedExplanation,
} from "./result-projection.js";
import { COMMERCE_OPERATIONS_SYSTEM_INSTRUCTIONS } from "./system-instructions.js";
import {
  connectAgentMcpClient,
  getModelToolDefinitions,
  type AgentMcpClient,
} from "./tool-catalog.js";

function emptyUsage(model: string): AgentUsageSummary {
  return {
    provider: "gemini",
    model,
    modelCalls: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: null,
  };
}

export interface CommerceOperationsAgentDependencies {
  config: AgentRuntimeConfig;
  provider: ModelProvider;
  identifiers?: AgentIdentifierGenerator;
  connectMcp?: () => Promise<AgentMcpClient>;
}

export function createCommerceOperationsAgent(
  dependencies: CommerceOperationsAgentDependencies,
) {
  const identifiers =
    dependencies.identifiers ?? createRuntimeIdentifierGenerator();

  return {
    async run(
      input: CommerceOperationsAgentRequest,
    ): Promise<CommerceOperationsAgentResult> {
      const request = CommerceOperationsAgentRequestSchema.parse(input);
      const runId = identifiers.createRunId();
      const intent = preflightIntent(request.message);
      const usage = emptyUsage(dependencies.config.model);
      const base = {
        schemaVersion: 1 as const,
        runId,
        ...createEmptyAuthoritativeState(),
        toolTrace: [],
        usage,
        commerceStateChanged: false as const,
      };

      if (intent.refusal) {
        return CommerceOperationsAgentResultSchema.parse({
          ...base,
          outcome: "REFUSED",
          message:
            "I can investigate and create a human-review case, but I cannot modify commerce state. No commerce state was changed.",
        });
      }
      if (intent.needsIdentifier) {
        return CommerceOperationsAgentResultSchema.parse({
          ...base,
          outcome: "NEEDS_USER_INPUT",
          message:
            "Please provide the required order or workflow identifier. No commerce state was changed.",
        });
      }

      let client: AgentMcpClient | undefined;
      try {
        client = dependencies.connectMcp
          ? await dependencies.connectMcp()
          : await connectAgentMcpClient({
              endpoint: dependencies.config.mcpServerUrl,
              ...(dependencies.config.mcpAuthBearerToken
                ? { bearerToken: dependencies.config.mcpAuthBearerToken }
                : {}),
            });

        const turn = await dependencies.provider.generateToolTurn({
          systemInstructions: COMMERCE_OPERATIONS_SYSTEM_INSTRUCTIONS,
          messages: [{ role: "user", text: request.message }],
          tools: getModelToolDefinitions(),
          generation: {
            model: dependencies.config.model,
            maxOutputTokens: 1_200,
            thinkingLevel: "low",
            timeoutMs: dependencies.config.providerTimeoutMs,
          },
        });
        usage.modelCalls += 1;
        usage.inputTokens += turn.usage.inputTokens;
        usage.outputTokens += turn.usage.outputTokens;
        usage.totalTokens += turn.usage.totalTokens;
        if (turn.kind !== "TOOL_CALLS" || turn.calls.length !== 1) {
          throw new Error("Expected one approved tool call");
        }

        const call = turn.calls[0];
        const toolName = ApprovedAgentToolNameSchema.parse(call.name);
        let toolInput = { ...call.arguments };
        if (toolName === "investigate_order_exception") {
          if (typeof toolInput.orderId !== "string") {
            throw new Error("Missing orderId");
          }
          toolInput = {
            orderId: toolInput.orderId,
            clientRequestId: identifiers.createClientRequestId(),
            idempotencyKey:
              identifiers.createInvestigationIdempotencyKey(),
          };
        }
        if (toolName === "create_human_review_escalation") {
          throw new Error("Escalation requires a prior investigation result");
        }

        const started = Date.now();
        const output = await client.callTool(toolName, toolInput);
        const state = createEmptyAuthoritativeState();
        const projection = projectMcpResult(toolName, output, state);
        if (!isSuccessfulMcpOutput(output)) {
          throw new Error("MCP returned a safe failure");
        }

        let explanation = await dependencies.provider.generateExplanation({
          systemInstructions: COMMERCE_OPERATIONS_SYSTEM_INSTRUCTIONS,
          userMessage: request.message,
          toolResults: [projection],
          generation: {
            model: dependencies.config.model,
            maxOutputTokens: 1_200,
            thinkingLevel: "low",
            timeoutMs: dependencies.config.providerTimeoutMs,
          },
        });
        usage.modelCalls += 1;
        usage.inputTokens += explanation.usage.inputTokens;
        usage.outputTokens += explanation.usage.outputTokens;
        usage.totalTokens += explanation.usage.totalTokens;
        let issues = validateGroundedExplanation(explanation.explanation, state);
        if (issues.length > 0) {
          explanation = await dependencies.provider.generateExplanation({
            systemInstructions: COMMERCE_OPERATIONS_SYSTEM_INSTRUCTIONS,
            userMessage: request.message,
            toolResults: [projection],
            generation: {
              model: dependencies.config.model,
              maxOutputTokens: 1_200,
              thinkingLevel: "low",
              timeoutMs: dependencies.config.providerTimeoutMs,
            },
            repairIssues: issues,
          });
          issues = validateGroundedExplanation(explanation.explanation, state);
        }
        if (issues.length > 0) {
          throw new Error("Grounding failed");
        }

        return CommerceOperationsAgentResultSchema.parse({
          schemaVersion: 1,
          runId,
          outcome: "ANSWERED",
          message: assembleGroundedMessage(explanation.explanation),
          ...state,
          toolTrace: [
            {
              sequence: 1,
              toolName,
              modelArguments: call.arguments,
              executed: true,
              outcome: "SUCCESS",
              resultSummary: projection,
              durationMs: Date.now() - started,
            },
          ],
          usage,
          commerceStateChanged: false,
        });
      } catch {
        return CommerceOperationsAgentResultSchema.parse({
          ...base,
          outcome: "SAFE_ERROR",
          message:
            "The AI host could not complete safely. No commerce state was changed.",
        });
      } finally {
        await client?.close().catch(() => undefined);
      }
    },
  };
}
