import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  APPROVED_AGENT_TOOL_NAMES,
  ApprovedAgentToolNameSchema,
  CreateHumanReviewEscalationToolOutputSchema,
  GetInvestigationTraceToolOutputSchema,
  GetReviewCaseToolOutputSchema,
  InvestigateOrderExceptionToolOutputSchema,
  ListDemoCasesToolOutputSchema,
  WorkflowIdentifierSchema,
  type ApprovedAgentToolName,
} from "@repo/schemas";
import { z } from "zod";

import type { AgentToolDefinition, JsonObject } from "./provider.js";

export const APPROVED_MCP_TOOL_NAMES = APPROVED_AGENT_TOOL_NAMES;

const EmptyArgumentsSchema = z.object({}).strict();
const InvestigateArgumentsSchema = z
  .object({ orderId: WorkflowIdentifierSchema })
  .strict();
const EscalationArgumentsSchema = z
  .object({ investigationId: WorkflowIdentifierSchema })
  .strict();
const ReviewCaseArgumentsSchema = z
  .object({ reviewCaseId: WorkflowIdentifierSchema })
  .strict();
const TraceArgumentsSchema = z
  .object({ investigationId: WorkflowIdentifierSchema })
  .strict();

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
      "Investigate why a specified order has not reached shipment creation. Evidence, diagnosis, escalation policy and persistence are server-owned.",
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
      "Create or reuse a human-review case for a stored investigation only after explicit user intent and a server result requiring human action.",
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
      "Read a persisted investigation, immutable evidence snapshot and safe ordered audit events by investigation ID.",
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

export function assertExactDiscoveredTools(names: readonly string[]): void {
  const discovered = [...names].sort();
  const approved = [...APPROVED_MCP_TOOL_NAMES].sort();
  if (
    discovered.length !== approved.length ||
    discovered.some((name, index) => name !== approved[index])
  ) {
    throw new Error("The MCP server advertised an unexpected tool surface.");
  }
}

export function parseModelToolArguments(
  name: ApprovedAgentToolName,
  value: unknown,
): JsonObject {
  switch (name) {
    case "list_demo_cases":
      return EmptyArgumentsSchema.parse(value);
    case "investigate_order_exception":
      return InvestigateArgumentsSchema.parse(value);
    case "create_human_review_escalation":
      return EscalationArgumentsSchema.parse(value);
    case "get_review_case":
      return ReviewCaseArgumentsSchema.parse(value);
    case "get_investigation_trace":
      return TraceArgumentsSchema.parse(value);
  }
}

export interface AgentMcpClient {
  readonly toolNames: readonly ApprovedAgentToolName[];
  callTool(
    name: ApprovedAgentToolName,
    arguments_: JsonObject,
  ): Promise<unknown>;
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
  try {
    assertExactDiscoveredTools(listed.tools.map(({ name }) => name));
  } catch (error) {
    await client.close().catch(() => undefined);
    throw error;
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
