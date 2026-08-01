import {
  DEFAULT_LOCAL_MCP_ALLOWED_HOSTS,
  normalizeMcpHost,
} from "@repo/config";
import { handleCommerceOperationsMcpHttpRequest } from "@repo/mcp";
import {
  createCommerceOperationsWorkflowContext,
  type CommerceOperationsWorkflowContext,
} from "@repo/workflow";
import { createHash, timingSafeEqual } from "node:crypto";
import express, {
  type ErrorRequestHandler,
  type RequestHandler,
} from "express";

import { notFoundMiddleware } from "./middleware/not-found.js";
import { healthRouter } from "./routes/health.js";

export interface ApiApplicationDependencies {
  allowedHosts?: readonly string[];
  mcpApiKey?: string;
  createWorkflowContext?: () => Promise<CommerceOperationsWorkflowContext>;
}

export interface ApiApplication {
  readonly app: express.Express;
  close(): Promise<void>;
}

function invalidJson(error: unknown): boolean {
  return (
    error instanceof SyntaxError &&
    "status" in error &&
    (error as { status?: unknown }).status === 400
  );
}

function secureSecretMatch(actual: string, expected: string): boolean {
  const actualDigest = createHash("sha256").update(actual).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(actualDigest, expectedDigest);
}

export function createApiApplication(
  dependencies: ApiApplicationDependencies = {},
): ApiApplication {
  const app = express();
  const allowedHosts = new Set(
    (dependencies.allowedHosts ?? DEFAULT_LOCAL_MCP_ALLOWED_HOSTS).map(
      normalizeMcpHost,
    ),
  );
  const workflowContextFactory =
    dependencies.createWorkflowContext ??
    createCommerceOperationsWorkflowContext;
  let workflowContextPromise:
    Promise<CommerceOperationsWorkflowContext> | undefined;
  let closePromise: Promise<void> | undefined;

  const getWorkflowContext = () => {
    workflowContextPromise ??= workflowContextFactory();
    return workflowContextPromise;
  };

  const validateMcpHost: RequestHandler = (request, response, next) => {
    const host = request.headers.host;
    if (!host || !allowedHosts.has(normalizeMcpHost(host))) {
      response.status(403).json({ error: "MCP_HOST_NOT_ALLOWED" });
      return;
    }
    next();
  };

  const authenticateMcp: RequestHandler = (request, response, next) => {
    if (!dependencies.mcpApiKey) {
      next();
      return;
    }

    const authorization = request.headers.authorization;
    if (authorization === undefined) {
      response.status(401).json({ error: "MCP_AUTH_REQUIRED" });
      return;
    }

    const match = /^Bearer ([^\s]+)$/.exec(authorization);
    if (!match?.[1] || !secureSecretMatch(match[1], dependencies.mcpApiKey)) {
      response.status(401).json({ error: "MCP_AUTH_INVALID" });
      return;
    }

    next();
  };

  app.disable("x-powered-by");
  app.use("/health", healthRouter);
  app.use("/mcp", validateMcpHost);
  app.use("/mcp", authenticateMcp);
  app.use(
    "/mcp",
    express.json({
      limit: "64kb",
      type: ["application/json", "application/*+json"],
    }),
  );
  app.all("/mcp", async (request, response) => {
    const context = await getWorkflowContext();
    await handleCommerceOperationsMcpHttpRequest(request, response, {
      workflow: context.workflow,
    });
  });
  app.use(notFoundMiddleware);

  const safeErrorMiddleware: ErrorRequestHandler = (
    error,
    _request,
    response,
    _next,
  ) => {
    if (response.headersSent) {
      return;
    }
    response
      .status(invalidJson(error) ? 400 : 500)
      .json({ error: invalidJson(error) ? "INVALID_JSON" : "INTERNAL_ERROR" });
  };
  app.use(safeErrorMiddleware);

  return {
    app,
    async close() {
      if (!workflowContextPromise) {
        return;
      }
      closePromise ??= workflowContextPromise.then(({ disconnect }) =>
        disconnect(),
      );
      await closePromise;
    },
  };
}

const defaultApplication = createApiApplication();

export const app = defaultApplication.app;
export const closeApp = () => defaultApplication.close();
