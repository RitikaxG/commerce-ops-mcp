import { runDirectMcpEvaluation } from "./direct/run.js";

void runDirectMcpEvaluation().catch((error) => {
  console.error(
    JSON.stringify({
      evaluation: "phase-10-direct-mcp",
      status: "FAIL",
      error: {
        name: error instanceof Error ? error.name : "UnknownError",
        message:
          "Direct MCP evaluation failed. Review the preceding command output.",
      },
    }),
  );
  process.exitCode = 1;
});
