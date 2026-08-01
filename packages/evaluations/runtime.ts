import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer, request as httpRequest, type Server } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HOST = "127.0.0.1";
const MODULE_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(MODULE_DIRECTORY, "../..");
const API_ENTRYPOINT = path.join(REPOSITORY_ROOT, "apps/api/dist/server.js");

async function closeServer(server: Server | undefined): Promise<void> {
  if (!server?.listening) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function reservePort(): Promise<number> {
  const server = createServer();
  server.listen(0, HOST);
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    await closeServer(server);
    throw new Error("Expected a TCP address while reserving an API port");
  }
  const port = address.port;
  await closeServer(server);
  return port;
}

async function runCommand(
  command: string,
  args: string[],
  cwd: string,
): Promise<void> {
  const child = spawn(command, args, {
    cwd,
    stdio: "inherit",
    env: process.env,
  });
  const [code, signal] = (await once(child, "exit")) as [
    number | null,
    NodeJS.Signals | null,
  ];
  if (code !== 0) {
    throw new Error(
      `${command} exited unsuccessfully (${String(code ?? signal)})`,
    );
  }
}

async function waitForHealth(baseUrl: URL, child: ChildProcess): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error("The API process exited before becoming healthy");
    }
    try {
      const response = await fetch(new URL("/health", baseUrl));
      if (response.status === 200) {
        return;
      }
    } catch {
      // The process may still be binding the port.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("The API did not become healthy before the timeout");
}

export interface DirectMcpApiRuntime {
  readonly baseUrl: URL;
  readonly endpoint: URL;
  readonly bearerToken?: string;
  close(): Promise<void>;
}

export async function startDirectMcpApi(): Promise<DirectMcpApiRuntime> {
  await runCommand(
    "bun",
    ["run", "--filter", "@repo/api", "build"],
    REPOSITORY_ROOT,
  );

  const port = await reservePort();
  const baseUrl = new URL(`http://${HOST}:${port}`);
  const bearerToken = process.env.MCP_API_KEY?.trim() || undefined;
  const child = spawn("node", [API_ENTRYPOINT], {
    cwd: REPOSITORY_ROOT,
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(port),
      MCP_ALLOWED_HOSTS: HOST,
    },
    stdio: ["ignore", "inherit", "inherit"],
  });
  await waitForHealth(baseUrl, child);

  let closePromise: Promise<void> | undefined;
  return {
    baseUrl,
    endpoint: new URL("/mcp", baseUrl),
    ...(bearerToken ? { bearerToken } : {}),
    close() {
      closePromise ??= (async () => {
        if (child.exitCode !== null) {
          return;
        }
        child.kill("SIGTERM");
        try {
          await Promise.race([
            once(child, "exit"),
            new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error("API shutdown timed out")),
                10_000,
              ),
            ),
          ]);
        } catch {
          child.kill("SIGKILL");
          await once(child, "exit").catch(() => undefined);
        }
      })();
      return closePromise;
    },
  };
}

export async function postMcpWithHost(
  url: URL,
  hostHeader: string,
  body: unknown,
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: "POST",
        headers: {
          accept: "application/json, text/event-stream",
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
          let parsed: unknown = text;
          try {
            parsed = JSON.parse(text);
          } catch {
            // Keep the raw text for a useful assertion.
          }
          resolve({ status: response.statusCode ?? 0, body: parsed });
        });
      },
    );
    request.on("error", reject);
    request.end(JSON.stringify(body));
  });
}
