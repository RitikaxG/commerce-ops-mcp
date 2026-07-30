import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import { after, describe, test } from "node:test";

import { app } from "../app.js";

let server: Server | undefined;

after(async () => {
  if (!server?.listening) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    server?.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
});

describe("GET /health", () => {
  test("returns the API readiness response", async () => {
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");

    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected the health test server to use a TCP port");
    }

    const response = await fetch(`http://127.0.0.1:${address.port}/health`);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ok" });
  });
});
