import { describe, expect, test } from "bun:test";

import { parseApiEnvironment, parseDatabaseEnvironment } from "../env.js";

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
