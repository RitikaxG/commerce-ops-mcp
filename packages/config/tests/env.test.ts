import { describe, expect, test } from "bun:test";

import { parseApiEnvironment } from "../env.js";

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
