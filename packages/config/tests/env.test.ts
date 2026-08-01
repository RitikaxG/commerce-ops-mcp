import { describe, expect, test } from "bun:test";

import {
  parseApiEnvironment,
  parseDatabaseAccessEnvironment,
  parseDatabaseEnvironment,
  parseDemoDatabaseEnvironment,
  parseWorkflowDatabaseEnvironment,
} from "../env.js";

const PRODUCTION_MCP_API_KEY =
  "phase12-production-test-key-00000000000000000000";

describe("parseApiEnvironment", () => {
  test("applies safe local defaults", () => {
    expect(parseApiEnvironment({})).toEqual({
      nodeEnv: "development",
      port: 3000,
      mcpAllowedHosts: ["localhost", "127.0.0.1", "::1"],
    });
  });

  test("rejects an invalid API port", () => {
    expect(() => parseApiEnvironment({ PORT: "70000" })).toThrow();
  });

  test("normalizes an explicit MCP host allowlist", () => {
    expect(
      parseApiEnvironment({
        NODE_ENV: "test",
        MCP_ALLOWED_HOSTS: " LOCALHOST:43120, api.example.test,localhost ",
      }).mcpAllowedHosts,
    ).toEqual(["localhost", "api.example.test"]);
  });

  test("requires explicit non-wildcard MCP hosts and an API key in production", () => {
    expect(() => parseApiEnvironment({ NODE_ENV: "production" })).toThrow();
    expect(() =>
      parseApiEnvironment({
        NODE_ENV: "production",
        MCP_ALLOWED_HOSTS: "*",
        MCP_API_KEY: PRODUCTION_MCP_API_KEY,
      }),
    ).toThrow();
    expect(() =>
      parseApiEnvironment({
        NODE_ENV: "production",
        MCP_ALLOWED_HOSTS: "mcp.example.com",
      }),
    ).toThrow();
    expect(
      parseApiEnvironment({
        NODE_ENV: "production",
        MCP_ALLOWED_HOSTS: "mcp.example.com",
        MCP_API_KEY: PRODUCTION_MCP_API_KEY,
      }),
    ).toEqual({
      nodeEnv: "production",
      port: 3000,
      mcpAllowedHosts: ["mcp.example.com"],
      mcpApiKey: PRODUCTION_MCP_API_KEY,
    });
  });
});

describe("parseDatabaseEnvironment", () => {
  test("accepts a PostgreSQL connection URL", () => {
    expect(
      parseDatabaseEnvironment({
        DATABASE_URL: "postgresql://demo:demo@localhost:5432/commerce",
      }),
    ).toEqual({
      databaseUrl: "postgresql://demo:demo@localhost:5432/commerce",
    });
  });

  test("rejects a non-PostgreSQL URL", () => {
    expect(() =>
      parseDatabaseEnvironment({
        DATABASE_URL: "https://example.com/database",
      }),
    ).toThrow();
  });
});

describe("parseDatabaseAccessEnvironment", () => {
  const input = {
    DATABASE_URL: "postgresql://owner:owner@localhost:5432/commerce",
    DEMO_DATABASE_URL: "postgresql://demo:demo@localhost:5432/commerce",
    WORKFLOW_DATABASE_URL:
      "postgresql://workflow:workflow@localhost:5432/commerce",
  };

  test("keeps owner, demo, and workflow connections separate", () => {
    expect(parseDatabaseAccessEnvironment(input)).toEqual({
      databaseUrl: input.DATABASE_URL,
      demoDatabaseUrl: input.DEMO_DATABASE_URL,
      workflowDatabaseUrl: input.WORKFLOW_DATABASE_URL,
    });
  });

  test("parses focused demo and workflow environments", () => {
    expect(parseDemoDatabaseEnvironment(input)).toEqual({
      demoDatabaseUrl: input.DEMO_DATABASE_URL,
    });
    expect(parseWorkflowDatabaseEnvironment(input)).toEqual({
      workflowDatabaseUrl: input.WORKFLOW_DATABASE_URL,
    });
  });

  test.each([
    "DATABASE_URL",
    "DEMO_DATABASE_URL",
    "WORKFLOW_DATABASE_URL",
  ] as const)("rejects a missing %s", (key) => {
    expect(() =>
      parseDatabaseAccessEnvironment({ ...input, [key]: undefined }),
    ).toThrow();
  });

  test("rejects non-PostgreSQL role URLs", () => {
    expect(() =>
      parseDatabaseAccessEnvironment({
        ...input,
        WORKFLOW_DATABASE_URL: "https://example.com/database",
      }),
    ).toThrow();
  });
});
