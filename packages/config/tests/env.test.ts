import { describe, expect, test } from "bun:test";

import {
  parseApiEnvironment,
  parseDatabaseAccessEnvironment,
  parseDatabaseEnvironment,
  parseDemoDatabaseEnvironment,
  parseWorkflowDatabaseEnvironment,
} from "../env.js";

describe("parseApiEnvironment", () => {
  test("applies safe local defaults", () => {
    expect(parseApiEnvironment({})).toEqual({
      nodeEnv: "development",
      port: 3000,
    });
  });

  test("rejects an invalid API port", () => {
    expect(() => parseApiEnvironment({ PORT: "70000" })).toThrow();
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
