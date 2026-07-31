import { describe, expect, test } from "bun:test";

import {
  GeminiModelProvider,
  SafeModelProviderError,
  getModelToolDefinitions,
} from "../index.js";

const ZERO_GENERATION = {
  model: "gemini-3.6-flash",
  maxOutputTokens: 500,
  thinkingLevel: "low" as const,
  timeoutMs: 5_000,
};

describe("Gemini provider mapping", () => {
  test("maps stateless Interactions API function calls and results", async () => {
    const requests: unknown[] = [];
    const responses = [
      {
        steps: [
          {
            type: "function_call",
            id: "call-1",
            name: "investigate_order_exception",
            arguments: { orderId: "ORD-1042" },
          },
        ],
        usage: { total_input_tokens: 10, total_output_tokens: 2, total_tokens: 12 },
      },
      {
        steps: [
          { type: "assistant_message", content: [{ type: "text", text: "done" }] },
        ],
        output_text: "done",
        usage: { total_input_tokens: 4, total_output_tokens: 1, total_tokens: 5 },
      },
    ];
    const fake = {
      models: { get: async () => ({ name: "gemini-3.6-flash" }) },
      interactions: {
        create: async (request: unknown) => {
          requests.push(request);
          const response = responses.shift();
          if (!response) throw new Error("missing fake response");
          return response;
        },
      },
    };
    const provider = new GeminiModelProvider("not-a-real-key", fake as never);

    const first = await provider.generateToolTurn({
      sessionId: "session",
      systemInstructions: "system",
      userMessage: "Investigate ORD-1042",
      tools: getModelToolDefinitions(),
      generation: ZERO_GENERATION,
    });
    expect(first).toMatchObject({
      kind: "TOOL_CALLS",
      calls: [
        {
          callId: "call-1",
          name: "investigate_order_exception",
          arguments: { orderId: "ORD-1042" },
        },
      ],
      usage: { totalTokens: 12 },
    });

    await provider.generateToolTurn({
      sessionId: "session",
      systemInstructions: "system",
      toolResult: {
        callId: "call-1",
        name: "investigate_order_exception",
        result: { orderId: "ORD-1042", commerceStateChanged: false },
      },
      tools: getModelToolDefinitions(),
      generation: ZERO_GENERATION,
    });

    expect(requests[0]).toMatchObject({
      model: "gemini-3.6-flash",
      store: false,
      system_instruction: "system",
      generation_config: {
        max_output_tokens: 500,
        thinking_level: "low",
        tool_choice: {
          allowed_tools: {
            mode: "any",
            tools: [
              "list_demo_cases",
              "investigate_order_exception",
              "create_human_review_escalation",
              "get_review_case",
              "get_investigation_trace",
            ],
          },
        },
      },
    });
    expect(JSON.stringify(requests[0])).not.toContain("idempotencyKey");
    expect(requests[1]).toMatchObject({
      input: expect.arrayContaining([
        expect.objectContaining({
          type: "function_result",
          call_id: "call-1",
          name: "investigate_order_exception",
        }),
      ]),
    });
  });

  test("parses a structured explanation and usage", async () => {
    const requests: unknown[] = [];
    const fake = {
      models: { get: async () => ({}) },
      interactions: {
        create: async (request: unknown) => {
          requests.push(request);
          return {
            output_text: JSON.stringify({
              summary: "Investigation complete.",
              reason: "The MCP result is authoritative.",
              nextStep: null,
            }),
            usage: {
              total_input_tokens: 8,
              total_output_tokens: 4,
              total_tokens: 12,
            },
          };
        },
      },
    };
    const provider = new GeminiModelProvider("not-a-real-key", fake as never);
    const result = await provider.generateExplanation({
      systemInstructions: "system",
      userMessage: "List demos",
      toolResults: [{ purpose: "DEMO_DISCOVERY_ONLY" }],
      generation: ZERO_GENERATION,
    });
    expect(result.explanation.summary).toBe("Investigation complete.");
    expect(result.usage.totalTokens).toBe(12);
    expect(requests[0]).toMatchObject({
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: {
          type: "object",
          properties: {
            nextStep: { type: ["string", "null"] },
          },
        },
      },
    });
  });

  test("maps authentication failures without leaking a key", async () => {
    const secret = "unit-test-sensitive-value";
    const fake = {
      models: { get: async () => ({}) },
      interactions: {
        create: async () => {
          throw { status: 401, message: secret };
        },
      },
    };
    const provider = new GeminiModelProvider(secret, fake as never);
    let caught: unknown;
    try {
      await provider.generateToolTurn({
        sessionId: "auth",
        systemInstructions: "system",
        userMessage: "Investigate ORD-1042",
        tools: getModelToolDefinitions(),
        generation: ZERO_GENERATION,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SafeModelProviderError);
    expect((caught as Error).message).not.toContain(secret);
    expect((caught as SafeModelProviderError).code).toBe("AUTHENTICATION_FAILED");
  });
});
