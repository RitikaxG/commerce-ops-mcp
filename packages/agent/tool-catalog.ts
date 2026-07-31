import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  ApprovedAgentToolNameSchema,
  CreateHumanReviewEscalationToolOutputSchema,
  GetInvestigationTraceToolOutputSchema,
  GetReviewCaseToolOutputSchema,
  InvestigateOrderExceptionToolOutputSchema,
  ListDemoCasesToolOutputSchema,
  type ApprovedAgentToolName,
} from "@repo/schemas";

import type { AgentToolDefinition, JsonObject } from "./provider.js";

export const APPROVED_MCP_TOOL_NAMES = [
  "list_demo_cases",
  "investigate_order_exception",
  "create_human_review_escalation",
  "get_review_case",
  "get_investigation_trace",
] as const satisfies readonly ApprovedAgentToolName[];

const MODEL_TOOL_DEFINITIONS: Record<
  ApprovedAgentToolName,
  AgentToolDefinition
> = {
  list_demo_cases: {
    name: "list_demo_cases",
    description:
      "List the bounded synthetic demo orders. Use only when the user asks what demo cases can be tested.",
    parametersJsonSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  investigate_order_exception: {
    name: "investigate_order_exception",
    description:
      "Investigate why a specified order has not reached shipment creation. The server owns evidence, diagnosis, escalation policy and persistence.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        orderId: { type: "string", minLength: 1, maxLength: 200 },
      },
      required: ["orderId"],
      additionalProperties: false,
    },
  },
  create_human_review_escalation: {
    name: "create_human_review_escalation",
    description:
      "Create or reuse a human-review case for a stored investigation only after the user explicitly requests escalation and the investigation requires human action.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        investigationId: { type: "string", minLength: 1, maxLength: 200 },
      },
      required: ["investigationId"],
      additionalProperties: false,
    },
  },
  get_review_case: {
    name: "get_review_case",
    description: "Read a stored human-review case by review-case ID.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        reviewCaseId: { type: "string", minLength: 1, maxLength: 200 },
      },
      required: ["reviewCaseId"],
      additionalProperties: false,
    },
  },
  get_investigation_trace: {
    name: "get_investigation_trace",
    description:
      "Read the persisted investigation, immutable evidence snapshot and safe ordered audit events by investigation ID.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        investigationId: { type: "string", minLength: 1, maxLength: 200 },
      },
      required: ["investigationId"],
      additionalProperties: false,
    },
  },
};

export function getModelToolDefinitions(): readonly AgentToolDefinition[] {
  return APPROVED_MCP_TOOL_NAMES.map((name) => MODEL_TOOL_DEFINITIONS[name]);
}

export interface AgentMcpClient {
  readonly toolNames: readonly ApprovedAgentToolName[];
  callTool(name: ApprovedAgentToolName, arguments_: JsonObject): Promise<unknown>;
  close(): Promise<void>;
}

function parseToolOutput(name: ApprovedAgentToolName, value: unknown): unknown {
  switch (name) {
    case "list_demo_cases":
      return ListDemoCasesToolOutputSchema.parse(value);
    case "investigate_order_exception":
      return InvestigateOrderExceptionToolOutputSchema.parse(value);
    case "create_human_review_escalation":
      return CreateHumanReviewEscalationToolOutputSchema.parse(value);
    case "get_review_case":
      return GetReviewCaseToolOutputSchema.parse(value);
    case "get_investigation_trace":
      return GetInvestigationTraceToolOutputSchema.parse(value);
  }
}

export async function connectAgentMcpClient(input: {
  endpoint: URL;
  bearerToken?: string;
}): Promise<AgentMcpClient> {
  const client = new Client({
    name: "commerce-operations-gemini-host",
    version: "1.0.0",
  });

  const headers = input.bearerToken
    ? { Authorization: `Bearer ${input.bearerToken}` }
    : undefined;
  const transport = new StreamableHTTPClientTransport(
    input.endpoint,
    headers ? ({ requestInit: { headers } } as never) : undefined,
  );
  await client.connect(transport);

  const listed = await client.listTools();
  const discovered = listed.tools.map(({ name }) => name).sort();
  const approved = [...APPROVED_MCP_TOOL_NAMES].sort();
  if (
    discovered.length !== approved.length ||
    discovered.some((name, index) => name !== approved[index])
  ) {
    await client.close().catch(() => undefined);
    throw new Error("The MCP server advertised an unexpected tool surface.");
  }

  return {
    toolNames: APPROVED_MCP_TOOL_NAMES,
    async callTool(name, arguments_) {
      const validName = ApprovedAgentToolNameSchema.parse(name);
      const response = await client.callTool({
        name: validName,
        arguments: arguments_,
      });
      return parseToolOutput(validName, response.structuredContent);
    },
    close: () => client.close(),
  };
}
