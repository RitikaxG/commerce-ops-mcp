import { z } from "zod";

export const DEFAULT_LOCAL_MCP_ALLOWED_HOSTS = [
  "localhost",
  "127.0.0.1",
  "::1",
] as const;

export function normalizeMcpHost(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized.startsWith("[")) {
    const closingBracket = normalized.indexOf("]");
    return closingBracket === -1
      ? normalized
      : normalized.slice(1, closingBracket);
  }
  const colon = normalized.lastIndexOf(":");
  return colon > -1 && normalized.indexOf(":") === colon
    ? normalized.slice(0, colon)
    : normalized;
}

function parseAllowedHosts(value: string | undefined): string[] {
  const hosts = (value ?? DEFAULT_LOCAL_MCP_ALLOWED_HOSTS.join(","))
    .split(",")
    .map(normalizeMcpHost)
    .filter(Boolean);
  return [...new Set(hosts)];
}

export const ApiEnvironmentSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3_000),
    MCP_ALLOWED_HOSTS: z.string().optional(),
    MCP_API_KEY: z.string().trim().min(32).max(512).optional(),
  })
  .superRefine((environment, context) => {
    const hosts = parseAllowedHosts(environment.MCP_ALLOWED_HOSTS);
    if (
      environment.NODE_ENV === "production" &&
      (environment.MCP_ALLOWED_HOSTS === undefined || hosts.length === 0)
    ) {
      context.addIssue({
        code: "custom",
        message: "MCP_ALLOWED_HOSTS is required in production",
        path: ["MCP_ALLOWED_HOSTS"],
      });
    }
    if (
      environment.NODE_ENV === "production" &&
      environment.MCP_API_KEY === undefined
    ) {
      context.addIssue({
        code: "custom",
        message: "MCP_API_KEY is required in production",
        path: ["MCP_API_KEY"],
      });
    }
    if (hosts.some((host) => host.includes("*"))) {
      context.addIssue({
        code: "custom",
        message: "MCP_ALLOWED_HOSTS does not accept wildcards",
        path: ["MCP_ALLOWED_HOSTS"],
      });
    }
  });

const PostgreSqlUrlSchema = z
  .url()
  .refine(
    (value) =>
      value.startsWith("postgresql://") || value.startsWith("postgres://"),
    "Database URLs must use the PostgreSQL protocol",
  );

export const SchemaOwnerDatabaseEnvironmentSchema = z.object({
  DATABASE_URL: PostgreSqlUrlSchema,
});

export const DemoDatabaseEnvironmentSchema = z.object({
  DEMO_DATABASE_URL: PostgreSqlUrlSchema,
});

export const WorkflowDatabaseEnvironmentSchema = z.object({
  WORKFLOW_DATABASE_URL: PostgreSqlUrlSchema,
});

export const DatabaseAccessEnvironmentSchema =
  SchemaOwnerDatabaseEnvironmentSchema.merge(
    DemoDatabaseEnvironmentSchema,
  ).merge(WorkflowDatabaseEnvironmentSchema);

export const DatabaseEnvironmentSchema = SchemaOwnerDatabaseEnvironmentSchema;

export interface ApiEnvironment {
  nodeEnv: z.infer<typeof ApiEnvironmentSchema>["NODE_ENV"];
  port: number;
  mcpAllowedHosts: readonly string[];
  mcpApiKey?: string;
}

export interface SchemaOwnerDatabaseEnvironment {
  databaseUrl: string;
}

export interface DemoDatabaseEnvironment {
  demoDatabaseUrl: string;
}

export interface WorkflowDatabaseEnvironment {
  workflowDatabaseUrl: string;
}

export interface DatabaseAccessEnvironment
  extends
    SchemaOwnerDatabaseEnvironment,
    DemoDatabaseEnvironment,
    WorkflowDatabaseEnvironment {}

export type DatabaseEnvironment = SchemaOwnerDatabaseEnvironment;

export function parseApiEnvironment(
  input: Readonly<Record<string, string | undefined>>,
): ApiEnvironment {
  const parsed = ApiEnvironmentSchema.parse(input);

  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT,
    mcpAllowedHosts: parseAllowedHosts(parsed.MCP_ALLOWED_HOSTS),
    ...(parsed.MCP_API_KEY ? { mcpApiKey: parsed.MCP_API_KEY } : {}),
  };
}

export function parseSchemaOwnerDatabaseEnvironment(
  input: Readonly<Record<string, string | undefined>>,
): SchemaOwnerDatabaseEnvironment {
  const parsed = SchemaOwnerDatabaseEnvironmentSchema.parse(input);

  return {
    databaseUrl: parsed.DATABASE_URL,
  };
}

export const parseDatabaseEnvironment = parseSchemaOwnerDatabaseEnvironment;

export function parseDemoDatabaseEnvironment(
  input: Readonly<Record<string, string | undefined>>,
): DemoDatabaseEnvironment {
  const parsed = DemoDatabaseEnvironmentSchema.parse(input);

  return {
    demoDatabaseUrl: parsed.DEMO_DATABASE_URL,
  };
}

export function parseWorkflowDatabaseEnvironment(
  input: Readonly<Record<string, string | undefined>>,
): WorkflowDatabaseEnvironment {
  const parsed = WorkflowDatabaseEnvironmentSchema.parse(input);

  return {
    workflowDatabaseUrl: parsed.WORKFLOW_DATABASE_URL,
  };
}

export function parseDatabaseAccessEnvironment(
  input: Readonly<Record<string, string | undefined>>,
): DatabaseAccessEnvironment {
  const parsed = DatabaseAccessEnvironmentSchema.parse(input);

  return {
    databaseUrl: parsed.DATABASE_URL,
    demoDatabaseUrl: parsed.DEMO_DATABASE_URL,
    workflowDatabaseUrl: parsed.WORKFLOW_DATABASE_URL,
  };
}
