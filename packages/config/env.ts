import { z } from "zod";

export const ApiEnvironmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3_000),
});

export interface ApiEnvironment {
  nodeEnv: z.infer<typeof ApiEnvironmentSchema>["NODE_ENV"];
  port: number;
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
