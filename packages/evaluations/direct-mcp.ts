import { runDirectMcpEvaluation } from "./direct/run.js";

function safeErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/postgres(?:ql)?:\/\/[^@\s]+@/gi, "postgresql://<redacted>@")
    .replace(/password=[^&\s]+/gi, "password=<redacted>")
    .slice(0, 500);
}

function safeErrorCode(error: unknown): string | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    ["string", "number"].includes(typeof error.code)
  ) {
    return String(error.code);
  }
  return undefined;
}

void runDirectMcpEvaluation().catch((error) => {
  console.error(
    JSON.stringify({
      evaluation: "phase-10-direct-mcp",
      status: "FAIL",
      error: {
        name: error instanceof Error ? error.name : "UnknownError",
        code: safeErrorCode(error),
        message: safeErrorMessage(error),
      },
    }),
  );
  process.exitCode = 1;
});
