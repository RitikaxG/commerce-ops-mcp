import assert from "node:assert/strict";
import { once } from "node:events";
import { request as httpRequest, type Server } from "node:http";
import { test } from "node:test";

import type {
  CommerceOperationsWorkflow,
  CommerceOperationsWorkflowContext,
} from "@repo/workflow";

import { createApiApplication } from "../app.js";

const MCP_API_KEY = "phase12-test-api-key-000000000000000000000000";

const unusedWorkflow: CommerceOperationsWorkflow = {
  async listDemoCases() {
    throw new Error("not called");
  },
  async investigateOrderException() {
    throw new Error("not called");
  },
  async createHumanReviewEscalation() {
    throw new Error("not called");
  },
  async getReviewCase() {
    throw new Error("not called");
  },
  async getInvestigationTrace() {
    throw new Error("not called");
  },
};

async function postWithHost(
  port: number,
  hostHeader: string,
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      {
        hostname: "127.0.0.1",
        port,
        path: "/mcp",
        method: "POST",
        headers: {
          accept: "application/json, text/event-stream",
          authorization: `Bearer ${MCP_API_KEY}`,
          "content-type": "application/json",
          host: hostHeader,
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          resolve({
            status: response.statusCode ?? 0,
            body: JSON.parse(text) as unknown,
          });
        });
      },
    );
    request.on("error", reject);
    request.end("{}");
  });
}

function initializeBody(): string {
  return JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "api-test", version: "1.0.0" },
    },
  });
}

test("API keeps health public and protects stateless Streamable HTTP MCP", async () => {
  let contextCreations = 0;
  let disconnects = 0;
  const context: CommerceOperationsWorkflowContext = {
    workflow: unusedWorkflow,
    async disconnect() {
      disconnects += 1;
    },
  };
  const application = createApiApplication({
    allowedHosts: ["127.0.0.1"],
    mcpApiKey: MCP_API_KEY,
    createWorkflowContext: async () => {
      contextCreations += 1;
      return context;
    },
  });
  let server: Server | undefined;

  try {
    server = application.app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected the API test server to use a TCP port");
    }
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const health = await fetch(`${baseUrl}/health`);
    assert.equal(health.status, 200);
    assert.equal(health.headers.get("x-powered-by"), null);
    assert.deepEqual(await health.json(), { status: "ok" });

    const missingToken = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
      },
      body: initializeBody(),
    });
    assert.equal(missingToken.status, 401);
    assert.deepEqual(await missingToken.json(), {
      error: "MCP_AUTH_REQUIRED",
    });

    for (const authorization of ["Bearer incorrect", "Basic incorrect"]) {
      const invalidToken = await fetch(`${baseUrl}/mcp`, {
        method: "POST",
        headers: {
          accept: "application/json, text/event-stream",
          authorization,
          "content-type": "application/json",
        },
        body: initializeBody(),
      });
      assert.equal(invalidToken.status, 401);
      assert.deepEqual(await invalidToken.json(), {
        error: "MCP_AUTH_INVALID",
      });
    }

    assert.equal(contextCreations, 0);

    const initialized = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${MCP_API_KEY}`,
        "content-type": "application/json",
      },
      body: initializeBody(),
    });
    assert.equal(initialized.status, 200);
    const initializeResponse = (await initialized.json()) as {
      result?: { serverInfo?: { name?: string } };
    };
    assert.equal(
      initializeResponse.result?.serverInfo?.name,
      "commerce-operations-investigator",
    );
    assert.equal(contextCreations, 1);

    for (const method of ["GET", "DELETE"] as const) {
      const unsupported = await fetch(`${baseUrl}/mcp`, {
        method,
        headers: { authorization: `Bearer ${MCP_API_KEY}` },
      });
      assert.equal(unsupported.status, 405);
      assert.equal(unsupported.headers.get("allow"), "POST");
      assert.deepEqual(await unsupported.json(), {
        jsonrpc: "2.0",
        error: { code: -32_000, message: "Method not allowed." },
        id: null,
      });
    }

    const invalidHost = await postWithHost(
      address.port,
      "disallowed.example",
    );
    assert.equal(invalidHost.status, 403);
    assert.deepEqual(invalidHost.body, {
      error: "MCP_HOST_NOT_ALLOWED",
    });

    const malformed = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${MCP_API_KEY}`,
        "content-type": "application/json",
      },
      body: "{",
    });
    assert.equal(malformed.status, 400);
    assert.deepEqual(await malformed.json(), { error: "INVALID_JSON" });

    const unrelated = await fetch(`${baseUrl}/not-a-route`);
    assert.equal(unrelated.status, 404);
    assert.deepEqual(await unrelated.json(), { error: "NOT_FOUND" });

    assert.equal(disconnects, 0);
    await application.close();
    await application.close();
    assert.equal(disconnects, 1);
  } finally {
    if (server?.listening) {
      await new Promise<void>((resolve, reject) => {
        server?.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
    await application.close();
  }
});
