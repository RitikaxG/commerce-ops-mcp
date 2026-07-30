import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

test("API startup does not seed or reset demo data", async () => {
  const testsDirectory = path.dirname(fileURLToPath(import.meta.url));
  const serverPath = path.resolve(
    testsDirectory,
    "../../../apps/api/server.ts",
  );
  const serverSource = await readFile(serverPath, "utf8");

  expect(serverSource).not.toContain("seedApprovedDemoData");
  expect(serverSource).not.toContain("resetApprovedDemoData");
  expect(serverSource).not.toContain("db:seed");
  expect(serverSource).not.toContain("db:reset-demo");
});
