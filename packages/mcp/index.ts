import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  CreateHumanReviewEscalationInputSchema,
  CreateHumanReviewEscalationToolSuccessSchema,
  GetInvestigationTraceInputSchema,
  GetInvestigationTraceToolSuccessSchema,
  GetReviewCaseInputSchema,
  GetReviewCaseToolSuccessSchema,
  InvestigateOrderExceptionInputSchema,
  InvestigateOrderExceptionToolSuccessSchema,
  ListDemoCasesInputSchema,
  ListDemoCasesToolSuccessSchema,
  McpToolFailureSchema,
} from "@repo/schemas";
import {
  WorkflowError,
  type CommerceOperationsWorkflow,
} from "@repo/workflow";
import type { IncomingMessage, ServerResponse } from "node:http";

export const COMMERCE_OPERATIONS_MCP_SERVER_NAME =
  "commerce-operations-investigator";
export const COMMERCE_OPERATIONS_MCP_SERVER_VERSION = "1.0.0";

export const MCP_TOOL_NAMES = [
  "list_demo_cases",
  "investigate_order_exception",
  "create_human_review_escalation",
  "get_review_case",
  "get_investigation_trace",
] as const;

const readAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const workflowWriteAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const internalErrorMessage = "The tool could not complete safely.";

export interface CommerceOperationsMcpDependencies {
  workflow: CommerceOperationsWorkflow;
}

interface OutputSchema {
  parse(input: unknown): unknown;
}

function successResult(
  schema: OutputSchema,
  result: unknown,
): CallToolResult {
  const envelope = schema.parse({
    schemaVersion: 1,
    ok: true,
    result,
  }) as Record<string, unknown>;

  return {
    structuredContent: envelope,
    content: [{ type: "text", text: JSON.stringify(envelope) }],
  };
}

function failureResult(error: unknown): CallToolResult {
  const envelope = McpToolFailureSchema.parse(
    error instanceof WorkflowError
      ? {
          schemaVersion: 1,
          ok: false,
          error: { code: error.code, message: error.message },
          commerceStateChanged: false,
        }
      : {
          schemaVersion: 1,
          ok: false,
          error: {
            code: "INTERNAL_ERROR",
            message: internalErrorMessage,
          },
          commerceStateChanged: false,
        },
  );

  return {
    isError: true,
    structuredContent: envelope,
    content: [{ type: "text", text: JSON.stringify(envelope) }],
  };
}

async function executeTool(
  schema: OutputSchema,
  operation: () => Promise<unknown>,
): Promise<CallToolResult> {
  try {
    return successResult(schema, await operation());
  } catch (error) {
    return failureResult(error);
  }
}

export function createCommerceOperationsMcpServer(
  dependencies: CommerceOperationsMcpDependencies,
): McpServer {
  const server = new McpServer({
    name: COMMERCE_OPERATIONS_MCP_SERVER_NAME,
    version: COMMERCE_OPERATIONS_MCP_SERVER_VERSION,
  });

  server.registerTool(
    "list_demo_cases",
    {
      title: "List approved demo cases",
      description:
        "Lists the nine approved synthetic order IDs and navigation categories without reading evidence or writing records. This catalog is for demo discovery only; call investigate_order_exception for the authoritative result.",
      inputSchema: ListDemoCasesInputSchema,
      outputSchema: ListDemoCasesToolSuccessSchema,
      annotations: readAnnotations,
    },
    async () =>
      executeTool(ListDemoCasesToolSuccessSchema, () =>
        dependencies.workflow.listDemoCases(),
      ),
  );

  server.registerTool(
    "investigate_order_exception",
    {
      title: "Investigate an order exception",
      description:
        "Reads commerce evidence, applies the deterministic workflow, and persists an investigation, immutable evidence snapshot, idempotency response, and append-only audit events in operations records. It does not create a human-review case and always reports commerceStateChanged=false.",
      inputSchema: InvestigateOrderExceptionInputSchema,
      outputSchema: InvestigateOrderExceptionToolSuccessSchema,
      annotations: workflowWriteAnnotations,
    },
    async (input) =>
      executeTool(InvestigateOrderExceptionToolSuccessSchema, () =>
        dependencies.workflow.investigateOrderException(input),
      ),
  );

  server.registerTool(
    "create_human_review_escalation",
    {
      title: "Create a human-review escalation",
      description:
        "Creates or reuses one persistent human-review case derived only from a stored eligible investigation. It writes escalation, idempotency, and append-only audit records but never changes commerce state and always reports commerceStateChanged=false.",
      inputSchema: CreateHumanReviewEscalationInputSchema,
      outputSchema: CreateHumanReviewEscalationToolSuccessSchema,
      annotations: workflowWriteAnnotations,
    },
    async (input) =>
      executeTool(CreateHumanReviewEscalationToolSuccessSchema, () =>
        dependencies.workflow.createHumanReviewEscalation(input),
      ),
  );

  server.registerTool(
    "get_review_case",
    {
      title: "Get a human-review case",
      description:
        "Returns one persisted human-review case and its source investigation without writing records or changing commerce state.",
      inputSchema: GetReviewCaseInputSchema,
      outputSchema: GetReviewCaseToolSuccessSchema,
      annotations: readAnnotations,
    },
    async (input) =>
      executeTool(GetReviewCaseToolSuccessSchema, () =>
        dependencies.workflow.getReviewCase(input),
      ),
  );

  server.registerTool(
    "get_investigation_trace",
    {
      title: "Get an investigation trace",
      description:
        "Returns the persisted investigation, immutable evidence snapshot, and ordered safe audit events without writing records or changing commerce state.",
      inputSchema: GetInvestigationTraceInputSchema,
      outputSchema: GetInvestigationTraceToolSuccessSchema,
      annotations: readAnnotations,
    },
    async (input) =>
      executeTool(GetInvestigationTraceToolSuccessSchema, () =>
        dependencies.workflow.getInvestigationTrace(input),
      ),
  );

  return server;
}

export interface CommerceOperationsMcpHttpRequest
  extends IncomingMessage {
  body?: unknown;
}

function writeJsonRpcError(
  response: ServerResponse,
  status: number,
  code: number,
  message: string,
): void {
  response.statusCode = status;
  response.setHeader("content-type", "application/json");
  response.end(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code, message },
      id: null,
    }),
  );
}

export async function handleCommerceOperationsMcpHttpRequest(
  request: CommerceOperationsMcpHttpRequest,
  response: ServerResponse,
  dependencies: CommerceOperationsMcpDependencies,
): Promise<void> {
  if (request.method !== "POST") {
    response.setHeader("allow", "POST");
    writeJsonRpcError(response, 405, -32_000, "Method not allowed.");
    return;
  }

  const server = createCommerceOperationsMcpServer(dependencies);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  let closed = false;
  const close = async () => {
    if (closed) {
      return;
    }
    closed = true;
    await server.close();
  };

  response.once("close", () => {
    void close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(request, response, request.body);
  } catch {
    if (!response.headersSent) {
      writeJsonRpcError(response, 500, -32_603, "Internal server error.");
    }
  } finally {
    if (response.writableEnded) {
      await close();
    }
  }
}
