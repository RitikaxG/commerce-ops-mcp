import {
  ApprovedAgentToolNameSchema,
  CommerceOperationsAgentRequestSchema,
  CommerceOperationsAgentResultSchema,
  type AgentToolTraceEntry,
  type AgentUsageSummary,
  type ApprovedAgentToolName,
  type CommerceOperationsAgentRequest,
  type CommerceOperationsAgentResult,
} from "@repo/schemas";

import type { AgentRuntimeConfig } from "./config.js";
import {
  createRuntimeIdentifierGenerator,
  type AgentIdentifierGenerator,
} from "./identifier-generator.js";
import {
  preflightIntent,
  type AgentIntentKind,
  type IntentPreflight,
} from "./intent.js";
import type {
  JsonObject,
  ModelProvider,
  ModelToolCall,
  ModelUsage,
} from "./provider.js";
import {
  assembleGroundedMessage,
  createEmptyAuthoritativeState,
  isSuccessfulMcpOutput,
  projectMcpResult,
  safeMcpFailureMessage,
  validateGroundedExplanation,
} from "./result-projection.js";
import { COMMERCE_OPERATIONS_SYSTEM_INSTRUCTIONS } from "./system-instructions.js";
import {
  connectAgentMcpClient,
  getModelToolDefinitions,
  parseModelToolArguments,
  type AgentMcpClient,
} from "./tool-catalog.js";

const MAX_MODEL_TURNS = 6;
const TOOL_SELECTION_TOKENS = 700;
const EXPLANATION_TOKENS = 900;

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

function addUsage(target: AgentUsageSummary, usage: ModelUsage): void {
  target.modelCalls += 1;
  target.inputTokens += usage.inputTokens;
  target.outputTokens += usage.outputTokens;
  target.totalTokens += usage.totalTokens;
}

function initialToolFor(kind: AgentIntentKind): ApprovedAgentToolName | null {
  switch (kind) {
    case "DEMO_DISCOVERY":
      return "list_demo_cases";
    case "INVESTIGATION":
      return "investigate_order_exception";
    case "ESCALATION":
      return "create_human_review_escalation";
    case "TRACE_READ":
      return "get_investigation_trace";
    case "REVIEW_CASE_READ":
      return "get_review_case";
    case "MUTATION":
    case "UNKNOWN":
      return null;
  }
}

function missingInputMessage(intent: IntentPreflight): string {
  switch (intent.needsIdentifier) {
    case "INVESTIGATION_ID":
      return "Please provide the investigation ID. No commerce state was changed.";
    case "REVIEW_CASE_ID":
      return "Please provide the review-case ID. No commerce state was changed.";
    default:
      return "Please provide the order or workflow identifier. No commerce state was changed.";
  }
}

async function withTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("MCP_TIMEOUT")), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

async function callMcpWithSafeRetry(
  client: AgentMcpClient,
  name: ApprovedAgentToolName,
  arguments_: JsonObject,
  timeoutMs: number,
): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await withTimeout(
        () => client.callTool(name, arguments_),
        timeoutMs,
      );
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("MCP_CALL_FAILED");
}

function verifyExpectedArguments(
  toolName: ApprovedAgentToolName,
  arguments_: JsonObject,
  intent: IntentPreflight,
  investigationId: string | null,
): void {
  if (
    toolName === "investigate_order_exception" &&
    arguments_.orderId !== intent.orderId
  ) {
    throw new Error("MODEL_ORDER_ID_MISMATCH");
  }
  if (
    toolName === "create_human_review_escalation" &&
    arguments_.investigationId !== (investigationId ?? intent.investigationId)
  ) {
    throw new Error("MODEL_INVESTIGATION_ID_MISMATCH");
  }
  if (
    toolName === "get_investigation_trace" &&
    arguments_.investigationId !== intent.investigationId
  ) {
    throw new Error("MODEL_INVESTIGATION_ID_MISMATCH");
  }
  if (
    toolName === "get_review_case" &&
    arguments_.reviewCaseId !== intent.reviewCaseId
  ) {
    throw new Error("MODEL_REVIEW_CASE_ID_MISMATCH");
  }
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
      const state = createEmptyAuthoritativeState();
      const usage = emptyUsage(dependencies.config.model);
      const toolTrace: AgentToolTraceEntry[] = [];
      const projections: JsonObject[] = [];
      const sessionId = `${runId}:selection`;
      const baseResult = () => ({
        schemaVersion: 1 as const,
        runId,
        ...state,
        toolTrace,
        usage,
        commerceStateChanged: false as const,
      });

      if (intent.kind === "MUTATION") {
        return CommerceOperationsAgentResultSchema.parse({
          ...baseResult(),
          outcome: "REFUSED",
          message:
            "I can investigate an order and create a human-review case, but I cannot modify commerce state. No commerce state was changed.",
        });
      }
      if (intent.needsIdentifier) {
        return CommerceOperationsAgentResultSchema.parse({
          ...baseResult(),
          outcome: "NEEDS_USER_INPUT",
          message: missingInputMessage(intent),
        });
      }

      const initialTool = initialToolFor(intent.kind);
      if (!initialTool) {
        return CommerceOperationsAgentResultSchema.parse({
          ...baseResult(),
          outcome: "NEEDS_USER_INPUT",
          message:
            "Please provide a supported investigation, escalation, case, trace, or demo request. No commerce state was changed.",
        });
      }

      let client: AgentMcpClient | undefined;
      let modelTurns = 0;
      let clientRequestId: string | null = null;
      let investigationIdempotencyKey: string | null = null;
      let escalationIdempotencyKey: string | null = null;

      const chooseTool = async (input_: {
        expected: ApprovedAgentToolName;
        userMessage?: string;
        toolResult?: {
          callId: string;
          name: ApprovedAgentToolName;
          result: JsonObject;
        };
      }): Promise<ModelToolCall> => {
        if (modelTurns >= MAX_MODEL_TURNS) {
          throw new Error("MODEL_TURN_LIMIT");
        }
        const turn = await dependencies.provider.generateToolTurn({
          sessionId,
          systemInstructions: COMMERCE_OPERATIONS_SYSTEM_INSTRUCTIONS,
          ...(input_.userMessage ? { userMessage: input_.userMessage } : {}),
          ...(input_.toolResult ? { toolResult: input_.toolResult } : {}),
          tools: getModelToolDefinitions(),
          generation: {
            model: dependencies.config.model,
            maxOutputTokens: TOOL_SELECTION_TOKENS,
            thinkingLevel: "low",
            timeoutMs: dependencies.config.providerTimeoutMs,
          },
        });
        modelTurns += 1;
        addUsage(usage, turn.usage);
        if (turn.kind !== "TOOL_CALLS" || turn.calls.length !== 1) {
          throw new Error("EXPECTED_ONE_TOOL_CALL");
        }
        const call = turn.calls[0];
        const toolName = ApprovedAgentToolNameSchema.parse(call.name);
        if (toolName !== input_.expected) {
          throw new Error("UNEXPECTED_TOOL_SELECTION");
        }
        return call;
      };

      const executeTool = async (
        call: ModelToolCall,
      ): Promise<{
        toolName: ApprovedAgentToolName;
        projection: JsonObject;
        output: unknown;
      }> => {
        if (!client) {
          throw new Error("MCP_NOT_CONNECTED");
        }
        if (toolTrace.length >= dependencies.config.maxToolSteps) {
          throw new Error("TOOL_STEP_LIMIT");
        }
        const toolName = ApprovedAgentToolNameSchema.parse(call.name);
        const modelArguments = parseModelToolArguments(
          toolName,
          call.arguments,
        );
        verifyExpectedArguments(
          toolName,
          modelArguments,
          intent,
          state.investigationId,
        );

        let executionArguments: JsonObject = modelArguments;
        if (toolName === "investigate_order_exception") {
          clientRequestId ??= identifiers.createClientRequestId();
          investigationIdempotencyKey ??=
            identifiers.createInvestigationIdempotencyKey();
          executionArguments = {
            orderId: modelArguments.orderId,
            clientRequestId,
            idempotencyKey: investigationIdempotencyKey,
          };
        } else if (toolName === "create_human_review_escalation") {
          const investigationId = modelArguments.investigationId;
          if (typeof investigationId !== "string") {
            throw new Error("MISSING_INVESTIGATION_ID");
          }
          escalationIdempotencyKey ??=
            identifiers.createEscalationIdempotencyKey(investigationId);
          executionArguments = {
            investigationId,
            idempotencyKey: escalationIdempotencyKey,
          };
        }

        const started = Date.now();
        const output = await callMcpWithSafeRetry(
          client,
          toolName,
          executionArguments,
          dependencies.config.mcpTimeoutMs,
        );
        const projection = projectMcpResult(toolName, output, state);
        const success = isSuccessfulMcpOutput(output);
        toolTrace.push({
          sequence: toolTrace.length + 1,
          toolName,
          modelArguments,
          executed: true,
          outcome: success ? "SUCCESS" : "SAFE_ERROR",
          resultSummary: projection,
          durationMs: Date.now() - started,
        });
        projections.push(projection);
        return { toolName, projection, output };
      };

      try {
        client = dependencies.connectMcp
          ? await dependencies.connectMcp()
          : await connectAgentMcpClient({
              endpoint: dependencies.config.mcpServerUrl,
              ...(dependencies.config.mcpAuthBearerToken
                ? { bearerToken: dependencies.config.mcpAuthBearerToken }
                : {}),
            });

        const firstCall = await chooseTool({
          expected: initialTool,
          userMessage: request.message,
        });
        const first = await executeTool(firstCall);
        if (!isSuccessfulMcpOutput(first.output)) {
          return CommerceOperationsAgentResultSchema.parse({
            ...baseResult(),
            outcome: "SAFE_ERROR",
            message: `${safeMcpFailureMessage(first.output)} No commerce state was changed.`,
          });
        }

        if (
          intent.kind === "INVESTIGATION" &&
          intent.explicitEscalation &&
          state.shouldEscalate === true
        ) {
          if (!state.investigationId) {
            throw new Error("MISSING_PERSISTED_INVESTIGATION_ID");
          }
          const escalationCall = await chooseTool({
            expected: "create_human_review_escalation",
            toolResult: {
              callId: firstCall.callId,
              name: first.toolName,
              result: first.projection,
            },
          });
          const escalation = await executeTool(escalationCall);
          if (!isSuccessfulMcpOutput(escalation.output)) {
            return CommerceOperationsAgentResultSchema.parse({
              ...baseResult(),
              outcome: "SAFE_ERROR",
              message: `${safeMcpFailureMessage(escalation.output)} No commerce state was changed.`,
            });
          }
        }

        let explanationTurn = await dependencies.provider.generateExplanation({
          systemInstructions: COMMERCE_OPERATIONS_SYSTEM_INSTRUCTIONS,
          userMessage: request.message,
          toolResults: projections,
          generation: {
            model: dependencies.config.model,
            maxOutputTokens: EXPLANATION_TOKENS,
            thinkingLevel: "low",
            timeoutMs: dependencies.config.providerTimeoutMs,
          },
        });
        modelTurns += 1;
        addUsage(usage, explanationTurn.usage);

        let issues = validateGroundedExplanation(
          explanationTurn.explanation,
          state,
        );
        if (issues.length > 0) {
          if (modelTurns >= MAX_MODEL_TURNS) {
            throw new Error("MODEL_TURN_LIMIT");
          }
          explanationTurn = await dependencies.provider.generateExplanation({
            systemInstructions: COMMERCE_OPERATIONS_SYSTEM_INSTRUCTIONS,
            userMessage: request.message,
            toolResults: projections,
            generation: {
              model: dependencies.config.model,
              maxOutputTokens: EXPLANATION_TOKENS,
              thinkingLevel: "low",
              timeoutMs: dependencies.config.providerTimeoutMs,
            },
            repairIssues: issues,
          });
          modelTurns += 1;
          addUsage(usage, explanationTurn.usage);
          issues = validateGroundedExplanation(
            explanationTurn.explanation,
            state,
          );
        }
        if (issues.length > 0) {
          throw new Error("GROUNDING_FAILED");
        }

        return CommerceOperationsAgentResultSchema.parse({
          ...baseResult(),
          outcome: "ANSWERED",
          message: assembleGroundedMessage(explanationTurn.explanation),
        });
      } catch {
        return CommerceOperationsAgentResultSchema.parse({
          ...baseResult(),
          outcome: "SAFE_ERROR",
          message:
            "The AI host could not complete safely. No commerce state was changed.",
        });
      } finally {
        dependencies.provider.clearSession(sessionId);
        await client?.close().catch(() => undefined);
      }
    },
  };
}
