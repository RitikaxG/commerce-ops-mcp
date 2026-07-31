import { describe, expect, test } from "bun:test";

import type {
  AgentRuntimeConfig,
  AgentMcpClient,
  JsonObject,
  ModelExplanationTurn,
  ModelProvider,
  ModelToolResult,
  ModelTurn,
} from "../index.js";
import {
  createCommerceOperationsAgent,
  createDeterministicIdentifierGenerator,
} from "../index.js";

const NEXT_STEP =
  "Review reassignment to an eligible warehouse; do not change commerce state automatically.";
const ZERO_USAGE = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

function config(): AgentRuntimeConfig {
  return {
    provider: "gemini",
    model: "gemini-3.6-flash",
    modelApiKey: "unit-test-placeholder",
    mcpServerUrl: new URL("http://127.0.0.1:3000/mcp"),
    maxToolSteps: 4,
    providerTimeoutMs: 30_000,
    mcpTimeoutMs: 15_000,
  };
}

function investigationOutput(shouldEscalate = true): unknown {
  return {
    schemaVersion: 1,
    ok: true,
    result: {
      orderId: "ORD-1042",
      investigationId: "INV-1042",
      status: "COMPLETED",
      decision: {
        evidenceStatus: "COMPLETE",
        diagnosisCode: shouldEscalate
          ? "ASSIGNED_WAREHOUSE_OUT_OF_STOCK"
          : "WITHIN_EXPECTED_PROCESSING_TIME",
        matchedRule: shouldEscalate
          ? "assigned_warehouse_out_of_stock.v1"
          : "within_expected_processing_time.v1",
        supportingFacts: [],
        shouldEscalate,
        suggestedQueue: shouldEscalate ? "FULFILMENT_OPERATIONS" : null,
        suggestedNextStep: shouldEscalate
          ? NEXT_STEP
          : "Continue normal monitoring within the expected processing window.",
        eligibleAlternativeWarehouseIds: shouldEscalate ? ["WH-B"] : [],
        commerceStateChanged: false,
      },
      commerceStateChanged: false,
    },
  };
}

function escalationOutput(): unknown {
  return {
    schemaVersion: 1,
    ok: true,
    result: {
      disposition: "CREATED",
      reviewCaseId: "CASE-1042",
      investigationId: "INV-1042",
      orderId: "ORD-1042",
      queue: "FULFILMENT_OPERATIONS",
      reasonCode: "ASSIGNED_WAREHOUSE_OUT_OF_STOCK",
      suggestedNextStep: NEXT_STEP,
      commerceStateChanged: false,
    },
  };
}

class FakeProvider implements ModelProvider {
  readonly toolTurns: ModelTurn[] = [];
  readonly explanations: ModelExplanationTurn[] = [];
  toolCalls = 0;
  explanationCalls = 0;
  readonly toolInputs: unknown[] = [];

  verifyModel(): Promise<void> {
    return Promise.resolve();
  }

  generateToolTurn(input: unknown): Promise<ModelTurn> {
    this.toolInputs.push(input);
    const value = this.toolTurns[this.toolCalls++];
    if (!value) {
      throw new Error("No fake tool turn");
    }
    return Promise.resolve(value);
  }

  generateExplanation(): Promise<ModelExplanationTurn> {
    const value = this.explanations[this.explanationCalls++];
    if (!value) {
      throw new Error("No fake explanation");
    }
    return Promise.resolve(value);
  }

  clearSession(): void {}
}

class FakeMcpClient implements AgentMcpClient {
  readonly toolNames = [
    "list_demo_cases",
    "investigate_order_exception",
    "create_human_review_escalation",
    "get_review_case",
    "get_investigation_trace",
  ] as const;
  readonly calls: Array<{ name: string; arguments: JsonObject }> = [];
  failuresRemaining = 0;
  investigateShouldEscalate = true;

  async callTool(
    name: (typeof this.toolNames)[number],
    arguments_: JsonObject,
  ) {
    this.calls.push({ name, arguments: { ...arguments_ } });
    if (this.failuresRemaining > 0) {
      this.failuresRemaining -= 1;
      throw new Error("temporary MCP error");
    }
    if (name === "investigate_order_exception") {
      return investigationOutput(this.investigateShouldEscalate);
    }
    if (name === "create_human_review_escalation") {
      return escalationOutput();
    }
    return {
      schemaVersion: 1,
      ok: true,
      result: { commerceStateChanged: false },
    };
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}

function toolTurn(
  name: string,
  arguments_: JsonObject,
  callId = "call-1",
): ModelTurn {
  return {
    kind: "TOOL_CALLS",
    calls: [{ callId, name, arguments: arguments_ }],
    usage: ZERO_USAGE,
  };
}

function explanation(
  _nextStep: string | null,
  reason = "Grounded in MCP evidence.",
): ModelExplanationTurn {
  return {
    explanation: {
      summary: "The order investigation completed.",
      reason,
      nextStep: null,
    },
    usage: ZERO_USAGE,
  };
}

describe("CommerceOperationsAgent", () => {
  test("injects reliability identifiers without exposing them to the model", async () => {
    const provider = new FakeProvider();
    provider.toolTurns.push(
      toolTurn("investigate_order_exception", { orderId: "ORD-1042" }),
    );
    provider.explanations.push(explanation(NEXT_STEP));
    const client = new FakeMcpClient();
    const agent = createCommerceOperationsAgent({
      config: config(),
      provider,
      identifiers: createDeterministicIdentifierGenerator("unit"),
      connectMcp: async () => client,
    });

    const result = await agent.run({ message: "Investigate ORD-1042" });

    expect(result.outcome).toBe("ANSWERED");
    expect(result.diagnosisCode).toBe("ASSIGNED_WAREHOUSE_OUT_OF_STOCK");
    expect(result.eligibleAlternativeWarehouseIds).toEqual(["WH-B"]);
    expect(client.calls).toHaveLength(1);
    expect(client.calls[0]?.arguments).toEqual({
      orderId: "ORD-1042",
      clientRequestId: "REQ-unit-2",
      idempotencyKey: "IDEMP-INV-unit-3",
    });
    expect(result.toolTrace[0]?.modelArguments).toEqual({
      orderId: "ORD-1042",
    });
    expect(JSON.stringify(provider.toolInputs)).not.toContain("idempotencyKey");
  });

  test("reuses one idempotency key for an MCP retry", async () => {
    const provider = new FakeProvider();
    provider.toolTurns.push(
      toolTurn("investigate_order_exception", { orderId: "ORD-1042" }),
    );
    provider.explanations.push(explanation(NEXT_STEP));
    const client = new FakeMcpClient();
    client.failuresRemaining = 1;
    const agent = createCommerceOperationsAgent({
      config: config(),
      provider,
      identifiers: createDeterministicIdentifierGenerator("retry"),
      connectMcp: async () => client,
    });

    const result = await agent.run({ message: "Investigate ORD-1042" });

    expect(result.outcome).toBe("ANSWERED");
    expect(client.calls).toHaveLength(2);
    expect(client.calls[0]?.arguments).toEqual(client.calls[1]?.arguments);
  });

  test("investigates before an explicitly requested eligible escalation", async () => {
    const provider = new FakeProvider();
    provider.toolTurns.push(
      toolTurn(
        "investigate_order_exception",
        { orderId: "ORD-1042" },
        "call-investigate",
      ),
      toolTurn(
        "create_human_review_escalation",
        { investigationId: "INV-1042" },
        "call-escalate",
      ),
    );
    provider.explanations.push(explanation(NEXT_STEP));
    const client = new FakeMcpClient();
    const agent = createCommerceOperationsAgent({
      config: config(),
      provider,
      identifiers: createDeterministicIdentifierGenerator("sequence"),
      connectMcp: async () => client,
    });

    const result = await agent.run({
      message:
        "Investigate ORD-1042 and create a human-review case if required.",
    });

    expect(result.outcome).toBe("ANSWERED");
    expect(result.reviewCaseId).toBe("CASE-1042");
    expect(client.calls.map(({ name }) => name)).toEqual([
      "investigate_order_exception",
      "create_human_review_escalation",
    ]);
    expect(client.calls[0]?.arguments.idempotencyKey).not.toBe(
      client.calls[1]?.arguments.idempotencyKey,
    );
    expect(provider.toolInputs[1]).toMatchObject({
      toolResult: {
        callId: "call-investigate",
        name: "investigate_order_exception",
      },
    });
  });

  test("does not escalate a non-actionable investigation", async () => {
    const provider = new FakeProvider();
    provider.toolTurns.push(
      toolTurn("investigate_order_exception", { orderId: "ORD-1042" }),
    );
    provider.explanations.push(
      explanation(
        "Continue normal monitoring within the expected processing window.",
      ),
    );
    const client = new FakeMcpClient();
    client.investigateShouldEscalate = false;
    const agent = createCommerceOperationsAgent({
      config: config(),
      provider,
      connectMcp: async () => client,
    });

    const result = await agent.run({
      message: "Investigate ORD-1042 and escalate it if needed.",
    });

    expect(result.outcome).toBe("ANSWERED");
    expect(client.calls.map(({ name }) => name)).toEqual([
      "investigate_order_exception",
    ]);
    expect(result.reviewCaseId).toBeNull();
  });

  test("refuses mutation requests without calling a model or MCP", async () => {
    const provider = new FakeProvider();
    const client = new FakeMcpClient();
    const agent = createCommerceOperationsAgent({
      config: config(),
      provider,
      connectMcp: async () => client,
    });

    const result = await agent.run({
      message: "Reassign ORD-1042 to WH-B now.",
    });

    expect(result.outcome).toBe("REFUSED");
    expect(provider.toolCalls).toBe(0);
    expect(client.calls).toHaveLength(0);
    expect(result.commerceStateChanged).toBeFalse();
  });

  test("asks for a missing identifier without a tool call", async () => {
    const provider = new FakeProvider();
    const client = new FakeMcpClient();
    const agent = createCommerceOperationsAgent({
      config: config(),
      provider,
      connectMcp: async () => client,
    });

    const result = await agent.run({ message: "Please investigate my order." });

    expect(result.outcome).toBe("NEEDS_USER_INPUT");
    expect(provider.toolCalls).toBe(0);
    expect(client.calls).toHaveLength(0);
  });

  test("rejects multiple model tool calls before MCP execution", async () => {
    const provider = new FakeProvider();
    provider.toolTurns.push({
      kind: "TOOL_CALLS",
      calls: [
        {
          callId: "one",
          name: "investigate_order_exception",
          arguments: { orderId: "ORD-1042" },
        },
        { callId: "two", name: "list_demo_cases", arguments: {} },
      ],
      usage: ZERO_USAGE,
    });
    const client = new FakeMcpClient();
    const agent = createCommerceOperationsAgent({
      config: config(),
      provider,
      connectMcp: async () => client,
    });

    const result = await agent.run({ message: "Investigate ORD-1042" });

    expect(result.outcome).toBe("SAFE_ERROR");
    expect(client.calls).toHaveLength(0);
  });

  test("allows one bounded grounding repair", async () => {
    const provider = new FakeProvider();
    provider.toolTurns.push(
      toolTurn("investigate_order_exception", { orderId: "ORD-1042" }),
    );
    provider.explanations.push(
      explanation(NEXT_STEP, "The order was successfully reassigned."),
      explanation(NEXT_STEP),
    );
    const client = new FakeMcpClient();
    const agent = createCommerceOperationsAgent({
      config: config(),
      provider,
      connectMcp: async () => client,
    });

    const result = await agent.run({ message: "Investigate ORD-1042" });

    expect(result.outcome).toBe("ANSWERED");
    expect(provider.explanationCalls).toBe(2);
    expect(result.message).not.toContain("successfully reassigned");
  });
});
