import { PrismaPg } from "@prisma/adapter-pg";
import {
  parseDemoDatabaseEnvironment,
  parseSchemaOwnerDatabaseEnvironment,
} from "@repo/config";
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

function createClient(
  connectionString: string,
  transactionOptions?: {
    maxWait: number;
    timeout: number;
  },
): PrismaClient {
  const connectionUrl = new URL(connectionString);

  // node-postgres currently treats `require` as full certificate verification
  // but warns that its next major will weaken that alias. Preserve the current
  // secure behavior explicitly without rewriting the developer's local .env.
  if (connectionUrl.searchParams.get("sslmode") === "require") {
    connectionUrl.searchParams.set("sslmode", "verify-full");
  }

  const adapter = new PrismaPg({ connectionString: connectionUrl.toString() });

  return new PrismaClient({ adapter, transactionOptions });
}

export function createOwnerDatabaseClient(): PrismaClient {
  loadDatabaseEnvironment();
  const { databaseUrl } = parseSchemaOwnerDatabaseEnvironment(process.env);

  return createClient(databaseUrl);
}

export function createDemoDatabaseClient(): PrismaClient {
  loadDatabaseEnvironment();
  const { demoDatabaseUrl } = parseDemoDatabaseEnvironment(process.env);

  return createClient(demoDatabaseUrl, {
    maxWait: 15_000,
    timeout: 30_000,
  });
}
