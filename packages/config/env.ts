import { z } from "zod";

export const ApiEnvironmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3_000),
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
