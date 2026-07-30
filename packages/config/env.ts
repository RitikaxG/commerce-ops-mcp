import { z } from "zod";

export const ApiEnvironmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3_000),
});

export const DatabaseEnvironmentSchema = z.object({
  DATABASE_URL: z
    .url()
    .refine(
      (value) =>
        value.startsWith("postgresql://") || value.startsWith("postgres://"),
      "DATABASE_URL must use the PostgreSQL protocol",
    ),
});

export interface ApiEnvironment {
  nodeEnv: z.infer<typeof ApiEnvironmentSchema>["NODE_ENV"];
  port: number;
}

export interface DatabaseEnvironment {
  databaseUrl: string;
}

export function parseApiEnvironment(
  input: Readonly<Record<string, string | undefined>>,
): ApiEnvironment {
  const parsed = ApiEnvironmentSchema.parse(input);

  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT,
  };
}

export function parseDatabaseEnvironment(
  input: Readonly<Record<string, string | undefined>>,
): DatabaseEnvironment {
  const parsed = DatabaseEnvironmentSchema.parse(input);

  return {
    databaseUrl: parsed.DATABASE_URL,
  };
}
