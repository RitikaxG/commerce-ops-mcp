import { parseApiEnvironment } from "@repo/config";

import { app } from "./app.js";

const environment = parseApiEnvironment(process.env);

app.listen(environment.port, () => {
  console.info(
    `Commerce operations API listening on port ${environment.port} (${environment.nodeEnv})`,
  );
});
