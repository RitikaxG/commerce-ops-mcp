import { expect } from "bun:test";
import {
  parseDatabaseAccessEnvironment,
  type DatabaseAccessEnvironment,
} from "@repo/config";
import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Client, type DatabaseError } from "pg";

const environmentPath = fileURLToPath(new URL("../.env", import.meta.url));

config({
  path: environmentPath,
  override: false,
  quiet: true,
});

export const databaseAccessEnvironment: DatabaseAccessEnvironment =
  parseDatabaseAccessEnvironment(process.env);

export function uniqueDatabaseId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

function normalizeConnectionUrl(value: string): string {
  const url = new URL(value);

  if (url.searchParams.get("sslmode") === "require") {
    url.searchParams.set("sslmode", "verify-full");
  }

  return url.toString();
}

export async function connectDatabase(url: string): Promise<Client> {
  const client = new Client({
    connectionString: normalizeConnectionUrl(url),
  });
  await client.connect();
  return client;
}

export async function expectDatabaseError(
  operation: Promise<unknown>,
  expectedCode: string | readonly string[],
): Promise<DatabaseError> {
  try {
    await operation;
  } catch (error) {
    const databaseError = error as DatabaseError;
    const expectedCodes =
      typeof expectedCode === "string" ? [expectedCode] : expectedCode;

    expect(databaseError.code).toBeDefined();
    expect(expectedCodes).toContain(databaseError.code as string);
    return databaseError;
  }

  throw new Error("Expected PostgreSQL to reject the statement");
}

export async function expectSavepointError(
  client: Client,
  name: string,
  statement: string,
  expectedCode: string | readonly string[],
): Promise<DatabaseError> {
  await client.query(`SAVEPOINT "${name}"`);

  try {
    return await expectDatabaseError(client.query(statement), expectedCode);
  } finally {
    await client.query(`ROLLBACK TO SAVEPOINT "${name}"`);
    await client.query(`RELEASE SAVEPOINT "${name}"`);
  }
}
