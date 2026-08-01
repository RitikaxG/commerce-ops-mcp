import { parseApiEnvironment } from "@repo/config";
import type { Server } from "node:http";

import { createApiApplication } from "./app.js";

const environment = parseApiEnvironment(process.env);
const application = createApiApplication({
  allowedHosts: environment.mcpAllowedHosts,
  ...(environment.mcpApiKey ? { mcpApiKey: environment.mcpApiKey } : {}),
});

const server: Server = application.app.listen(
  environment.port,
  "0.0.0.0",
  () => {
    console.info(
      `Commerce operations API listening on port ${environment.port} (${environment.nodeEnv})`,
    );
  },
);

let shutdownPromise: Promise<void> | undefined;

function shutdown(): Promise<void> {
  shutdownPromise ??= new Promise<void>((resolve, reject) => {
    server.close((error) => {
      void application
        .close()
        .then(() => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        })
        .catch(reject);
    });
  });
  return shutdownPromise;
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void shutdown()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  });
}
