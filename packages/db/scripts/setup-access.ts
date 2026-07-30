import {
  parseDatabaseAccessEnvironment,
  parseSchemaOwnerDatabaseEnvironment,
} from "@repo/config";
import { config } from "dotenv";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const DEMO_ROLE = "commerce_demo";
const WORKFLOW_ROLE = "commerce_workflow";
const CREATE_LOCAL_CREDENTIALS_FLAG = "--create-local-credentials";
const packageDirectory = fileURLToPath(new URL("../", import.meta.url));
const environmentPath = fileURLToPath(new URL("../.env", import.meta.url));
const accessSqlPath = fileURLToPath(
  new URL("../sql/access-control.sql", import.meta.url),
);

interface RoleConnection {
  role: string;
  url: string;
  password: string;
}

function normalizeConnectionUrl(value: string): string {
  const url = new URL(value);

  if (url.searchParams.get("sslmode") === "require") {
    url.searchParams.set("sslmode", "verify-full");
  }

  return url.toString();
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function deriveRoleConnection(ownerUrl: string, role: string): RoleConnection {
  const url = new URL(ownerUrl);
  const password =
    crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID();

  url.username = role;
  url.password = password;

  return {
    role,
    url: url.toString(),
    password,
  };
}

function parseRoleConnection(urlValue: string, role: string): RoleConnection {
  const url = new URL(urlValue);
  const username = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);

  if (username !== role) {
    throw new Error(
      `${role} connection must authenticate as the PostgreSQL role ${role}`,
    );
  }
  if (password.length === 0) {
    throw new Error(`${role} connection must include a password`);
  }

  return { role, url: url.toString(), password };
}

async function upsertLocalEnvironment(
  demoDatabaseUrl: string,
  workflowDatabaseUrl: string,
): Promise<void> {
  const original = await readFile(environmentPath, "utf8");
  const values = new Map([
    ["DEMO_DATABASE_URL", demoDatabaseUrl],
    ["WORKFLOW_DATABASE_URL", workflowDatabaseUrl],
  ]);
  const seen = new Set<string>();
  const lines = original.split(/\r?\n/).map((line) => {
    const match = /^([A-Z][A-Z0-9_]*)=/.exec(line);
    const key = match?.[1];

    if (!key || !values.has(key)) {
      return line;
    }

    seen.add(key);
    return `${key}=${values.get(key)}`;
  });

  for (const [key, value] of values) {
    if (!seen.has(key)) {
      lines.push(`${key}=${value}`);
    }
  }

  await writeFile(environmentPath, `${lines.filter(Boolean).join("\n")}\n`, {
    mode: 0o600,
  });
  await chmod(environmentPath, 0o600);
}

async function configureRole(
  owner: Client,
  connection: RoleConnection,
): Promise<void> {
  const existing = await owner.query<{
    canLogin: boolean;
    isSuperuser: boolean;
    canCreateDatabase: boolean;
    canCreateRole: boolean;
    inheritsPrivileges: boolean;
    canReplicate: boolean;
    bypassesRowSecurity: boolean;
  }>(
    `SELECT
      rolcanlogin AS "canLogin",
      rolsuper AS "isSuperuser",
      rolcreatedb AS "canCreateDatabase",
      rolcreaterole AS "canCreateRole",
      rolinherit AS "inheritsPrivileges",
      rolreplication AS "canReplicate",
      rolbypassrls AS "bypassesRowSecurity"
    FROM pg_catalog.pg_roles
    WHERE rolname = $1`,
    [connection.role],
  );

  if (existing.rowCount === 0) {
    await owner.query(
      `CREATE ROLE ${quoteIdentifier(connection.role)} WITH LOGIN PASSWORD ${quoteLiteral(connection.password)} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`,
    );

    return;
  }

  const role = existing.rows[0];

  if (
    !role?.canLogin ||
    role.isSuperuser ||
    role.canCreateDatabase ||
    role.canCreateRole ||
    role.inheritsPrivileges ||
    role.canReplicate ||
    role.bypassesRowSecurity
  ) {
    throw new Error(
      `Existing PostgreSQL role ${connection.role} has broader attributes than the approved boundary`,
    );
  }
}

async function verifyRoleConnection(connection: RoleConnection): Promise<void> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const client = new Client({
      connectionString: normalizeConnectionUrl(connection.url),
    });

    try {
      await client.connect();
      const result = await client.query<{ current_user: string }>(
        "SELECT current_user",
      );

      if (result.rows[0]?.current_user !== connection.role) {
        throw new Error(
          `Expected ${connection.role}, received ${result.rows[0]?.current_user ?? "unknown role"}`,
        );
      }

      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  throw lastError;
}

async function main(): Promise<void> {
  config({
    path: environmentPath,
    override: false,
    quiet: true,
  });

  const { databaseUrl } = parseSchemaOwnerDatabaseEnvironment(process.env);
  const createLocalCredentials = process.argv.includes(
    CREATE_LOCAL_CREDENTIALS_FLAG,
  );
  const generatedDemoConnection =
    !process.env.DEMO_DATABASE_URL && createLocalCredentials
      ? deriveRoleConnection(databaseUrl, DEMO_ROLE)
      : undefined;
  const generatedWorkflowConnection =
    !process.env.WORKFLOW_DATABASE_URL && createLocalCredentials
      ? deriveRoleConnection(databaseUrl, WORKFLOW_ROLE)
      : undefined;
  const accessEnvironment = parseDatabaseAccessEnvironment({
    ...process.env,
    DEMO_DATABASE_URL:
      process.env.DEMO_DATABASE_URL ?? generatedDemoConnection?.url,
    WORKFLOW_DATABASE_URL:
      process.env.WORKFLOW_DATABASE_URL ?? generatedWorkflowConnection?.url,
  });
  const demoConnection = parseRoleConnection(
    accessEnvironment.demoDatabaseUrl,
    DEMO_ROLE,
  );
  const workflowConnection = parseRoleConnection(
    accessEnvironment.workflowDatabaseUrl,
    WORKFLOW_ROLE,
  );
  const ownerUrl = new URL(accessEnvironment.databaseUrl);
  const databaseName = decodeURIComponent(ownerUrl.pathname.slice(1));
  const accessSql = await readFile(accessSqlPath, "utf8");
  const owner = new Client({
    connectionString: normalizeConnectionUrl(accessEnvironment.databaseUrl),
  });
  let setupStage = "connect owner";

  try {
    await owner.connect();
    setupStage = "begin access transaction";
    await owner.query("BEGIN");
    setupStage = `configure ${DEMO_ROLE}`;
    await configureRole(owner, demoConnection);
    setupStage = `configure ${WORKFLOW_ROLE}`;
    await configureRole(owner, workflowConnection);
    setupStage = "revoke database CREATE";
    await owner.query(
      `REVOKE CREATE ON DATABASE ${quoteIdentifier(databaseName)} FROM ${quoteIdentifier(DEMO_ROLE)}, ${quoteIdentifier(WORKFLOW_ROLE)}`,
    );
    setupStage = "grant database CONNECT";
    await owner.query(
      `GRANT CONNECT ON DATABASE ${quoteIdentifier(databaseName)} TO ${quoteIdentifier(DEMO_ROLE)}, ${quoteIdentifier(WORKFLOW_ROLE)}`,
    );
    setupStage = "apply schema grants";
    await owner.query(accessSql);
    setupStage = "commit access transaction";
    await owner.query("COMMIT");
  } catch (error) {
    await owner.query("ROLLBACK").catch(() => undefined);
    const code =
      typeof error === "object" && error && "code" in error
        ? String(error.code)
        : "unknown";

    if (code === "42501") {
      throw new Error(
        `The configured schema-owner connection was denied during "${setupStage}". The hosted PostgreSQL role/grant boundary needs provider-compatible owner privileges.`,
      );
    }

    throw error;
  } finally {
    await owner.end().catch(() => undefined);
  }

  await verifyRoleConnection(demoConnection);
  await verifyRoleConnection(workflowConnection);

  if (generatedDemoConnection || generatedWorkflowConnection) {
    await upsertLocalEnvironment(demoConnection.url, workflowConnection.url);
  }

  console.log(
    JSON.stringify(
      {
        database: databaseName,
        roles: {
          demo: DEMO_ROLE,
          workflow: WORKFLOW_ROLE,
        },
        credentialsWrittenTo:
          generatedDemoConnection || generatedWorkflowConnection
            ? `${packageDirectory}.env (ignored)`
            : "existing environment",
        apiStartupChanged: false,
      },
      null,
      2,
    ),
  );
}

await main();
