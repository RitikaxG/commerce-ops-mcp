import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import { test } from "node:test";

import type {
  CommerceOperationsWorkflow,
  CommerceOperationsWorkflowContext,
} from "@repo/workflow";

import { createApiApplication } from "../app.js";

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

test("API preserves health and safely mounts stateless Streamable HTTP MCP", async () => {
  let disconnects = 0;
  const context: CommerceOperationsWorkflowContext = {
    workflow: unusedWorkflow,
    async disconnect() {
      disconnects += 1;
    },
  };
  const application = createApiApplication({
    allowedHosts: ["127.0.0.1"],
    createWorkflowContext: async () => context,
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

    const initialized = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "api-test", version: "1.0.0" },
        },
      }),
    });
    assert.equal(initialized.status, 200);
    const initializeBody = (await initialized.json()) as {
      result?: { serverInfo?: { name?: string } };
    };
    assert.equal(
      initializeBody.result?.serverInfo?.name,
      "commerce-operations-investigator",
    );

    for (const method of ["GET", "DELETE"] as const) {
      const unsupported = await fetch(`${baseUrl}/mcp`, { method });
      assert.equal(unsupported.status, 405);
      assert.equal(unsupported.headers.get("allow"), "POST");
      assert.deepEqual(await unsupported.json(), {
        jsonrpc: "2.0",
        error: { code: -32_000, message: "Method not allowed." },
        id: null,
      });
    }

    const invalidHost = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        host: "disallowed.example",
      },
      body: "{}",
    });
    assert.equal(invalidHost.status, 403);
    assert.deepEqual(await invalidHost.json(), {
      error: "MCP_HOST_NOT_ALLOWED",
    });

    const malformed = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
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
