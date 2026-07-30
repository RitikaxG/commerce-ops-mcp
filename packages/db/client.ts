import { PrismaPg } from "@prisma/adapter-pg";
import { parseDatabaseEnvironment } from "@repo/config";
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PrismaClient } from "./generated/prisma/client.js";

function loadDatabaseEnvironment(): void {
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  const packageDirectory =
    path.basename(moduleDirectory) === "dist"
      ? path.dirname(moduleDirectory)
      : moduleDirectory;

  config({
    path: path.join(packageDirectory, ".env"),
    override: false,
    quiet: true,
  });
}

export function createDatabaseClient(): PrismaClient {
  loadDatabaseEnvironment();
  const { databaseUrl } = parseDatabaseEnvironment(process.env);
  const connectionUrl = new URL(databaseUrl);

  // node-postgres currently treats `require` as full certificate verification
  // but warns that its next major will weaken that alias. Preserve the current
  // secure behavior explicitly without rewriting the developer's local .env.
  if (connectionUrl.searchParams.get("sslmode") === "require") {
    connectionUrl.searchParams.set("sslmode", "verify-full");
  }

  const adapter = new PrismaPg({ connectionString: connectionUrl.toString() });

  return new PrismaClient({ adapter });
}
