import { z } from "zod";

const HttpUrlSchema = z
  .string()
  .url()
  .transform((value) => new URL(value))
  .refine((url) => ["http:", "https:"].includes(url.protocol), {
    message: "MCP_SERVER_URL must use HTTP or HTTPS",
  })
  .refine((url) => url.pathname.endsWith("/mcp"), {
    message: "MCP_SERVER_URL must end in /mcp",
  });

const ModelEnvironmentSchema = z
  .object({
    MODEL_PROVIDER: z.literal("gemini"),
    MODEL_NAME: z.string().trim().min(1).max(200),
    MODEL_API_KEY: z.string().trim().min(1),
  })
  .passthrough();

const AgentEnvironmentSchema = ModelEnvironmentSchema.extend({
  MCP_SERVER_URL: HttpUrlSchema,
  MCP_AUTH_BEARER_TOKEN: z.string().trim().min(1).optional(),
  AGENT_MAX_TOOL_STEPS: z.coerce.number().int().min(1).max(8).default(4),
  AGENT_PROVIDER_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(120_000)
    .default(30_000),
  AGENT_MCP_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(60_000)
    .default(15_000),
}).passthrough();

export interface ModelRuntimeConfig {
  readonly provider: "gemini";
  readonly model: string;
  readonly modelApiKey: string;
}

export interface AgentRuntimeConfig extends ModelRuntimeConfig {
  readonly mcpServerUrl: URL;
  readonly mcpAuthBearerToken?: string;
  readonly maxToolSteps: number;
  readonly providerTimeoutMs: number;
  readonly mcpTimeoutMs: number;
}

export function parseModelRuntimeConfig(
  environment: NodeJS.ProcessEnv = process.env,
): ModelRuntimeConfig {
  const parsed = ModelEnvironmentSchema.parse(environment);
  return {
    provider: parsed.MODEL_PROVIDER,
    model: parsed.MODEL_NAME,
    modelApiKey: parsed.MODEL_API_KEY,
  };
}

export function parseAgentRuntimeConfig(
  environment: NodeJS.ProcessEnv = process.env,
): AgentRuntimeConfig {
  const parsed = AgentEnvironmentSchema.parse(environment);
  return {
    provider: parsed.MODEL_PROVIDER,
    model: parsed.MODEL_NAME,
    modelApiKey: parsed.MODEL_API_KEY,
    mcpServerUrl: parsed.MCP_SERVER_URL,
    ...(parsed.MCP_AUTH_BEARER_TOKEN
      ? { mcpAuthBearerToken: parsed.MCP_AUTH_BEARER_TOKEN }
      : {}),
    maxToolSteps: parsed.AGENT_MAX_TOOL_STEPS,
    providerTimeoutMs: parsed.AGENT_PROVIDER_TIMEOUT_MS,
    mcpTimeoutMs: parsed.AGENT_MCP_TIMEOUT_MS,
  };
}
