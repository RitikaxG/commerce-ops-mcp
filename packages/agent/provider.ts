import type { ModelExplanation } from "@repo/schemas";

export type JsonObject = Record<string, unknown>;

export interface AgentToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly parametersJsonSchema: JsonObject;
}

export interface ModelUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
}

export interface ModelToolCall {
  readonly callId: string;
  readonly name: string;
  readonly arguments: JsonObject;
}

export interface ModelToolResult {
  readonly callId: string;
  readonly name: string;
  readonly result: JsonObject;
}

export type ModelTurn =
  | {
      readonly kind: "TOOL_CALLS";
      readonly calls: readonly ModelToolCall[];
      readonly usage: ModelUsage;
    }
  | {
      readonly kind: "TEXT";
      readonly text: string;
      readonly usage: ModelUsage;
    };

export interface AgentGenerationConfig {
  readonly model: string;
  readonly maxOutputTokens: number;
  readonly thinkingLevel: "minimal" | "low" | "medium" | "high";
  readonly timeoutMs: number;
}

export interface ModelExplanationTurn {
  readonly explanation: ModelExplanation;
  readonly usage: ModelUsage;
}

export interface ModelProvider {
  verifyModel(model: string): Promise<void>;

  generateToolTurn(input: {
    readonly sessionId: string;
    readonly systemInstructions: string;
    readonly userMessage?: string;
    readonly toolResult?: ModelToolResult;
    readonly tools: readonly AgentToolDefinition[];
    readonly generation: AgentGenerationConfig;
  }): Promise<ModelTurn>;

  generateExplanation(input: {
    readonly systemInstructions: string;
    readonly userMessage: string;
    readonly toolResults: readonly JsonObject[];
    readonly generation: AgentGenerationConfig;
    readonly repairIssues?: readonly string[];
  }): Promise<ModelExplanationTurn>;

  clearSession(sessionId: string): void;
}

export type SafeModelProviderErrorCode =
  | "AUTHENTICATION_FAILED"
  | "MODEL_UNAVAILABLE"
  | "RATE_LIMITED"
  | "PROVIDER_TIMEOUT"
  | "INVALID_PROVIDER_RESPONSE"
  | "PROVIDER_UNAVAILABLE";

export class SafeModelProviderError extends Error {
  readonly code: SafeModelProviderErrorCode;

  constructor(
    code: SafeModelProviderErrorCode,
    message = "The model provider could not complete safely.",
  ) {
    super(message);
    this.name = "SafeModelProviderError";
    this.code = code;
  }
}
