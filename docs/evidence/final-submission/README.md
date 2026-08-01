# Final Submission Evidence

This directory contains the redacted evidence used to verify the hosted commerce-operations MCP through both required client paths:

1. MCP Inspector for manual protocol and tool verification.
2. Gemini CLI as an independent MCP-compatible AI client.

No bearer token, model-provider key, database URL, SSH material, or complete Authorization header is included.

## 1. Hosted verification report

[Download the full verification report](00-hosted-mcp-verification-report.pdf)

![Hosted verification report preview](00-hosted-mcp-verification-report-preview.png)

**Demonstrates:** final PASS status, hosted endpoint, Streamable HTTP transport, bearer authentication boundary, exact five-tool surface, MCP Inspector result, Gemini CLI result, and `commerceStateChanged=false`.

**Redaction:** the reviewer token value is omitted.

Related document: [Final evaluation](../../final-evaluation.md)

## 2. MCP Inspector server configuration

![MCP Inspector server configuration](01-inspector-connection.png)

**Demonstrates:** the public HTTPS `/mcp` URL and Streamable HTTP transport configured in MCP Inspector.

**Reviewer should notice:** the server is added as a remote MCP endpoint rather than a local process.

**Redaction:** the bearer-token/header control is not visible.

Related document: [Reviewer guide - MCP Inspector](../../reviewer-guide.md#path-a-mcp-inspector)

## 3. MCP Inspector exact tool catalog

![MCP Inspector exact five-tool catalog](02-inspector-five-tools.png)

**Demonstrates:** successful connection and discovery of exactly five approved tools.

**Reviewer should notice:** the tool descriptions state the workflow side effects and `commerceStateChanged=false`; no commerce mutation tool appears.

**Redaction:** no authentication value is shown.

## 4. MCP Inspector persisted trace

![MCP Inspector persisted investigation trace](03-inspector-trace.png)

**Demonstrates:** `ORD-1042` was investigated and the persisted investigation, immutable evidence snapshot, diagnosis, queue, next step, and ordered workflow activity can be retrieved.

**Reviewer should notice:** `ASSIGNED_WAREHOUSE_OUT_OF_STOCK`, queue `FULFILMENT_OPERATIONS`, and `commerceStateChanged=false` are returned from the server.

**Redaction:** credentials and unrelated browser details are excluded.

## 5. Gemini CLI hosted MCP discovery

![Gemini CLI showing the hosted MCP ready](04-gemini-mcp-ready.png)

**Demonstrates:** an independent MCP-compatible AI client connected to the same hosted endpoint and discovered all five tools.

**Reviewer should notice:** `commerce-ops-hosted - Ready (5 tools)` and the five namespaced tools.

**Redaction:** the OAuth URL, local workspace path, branch name, bearer token, and model API key are not displayed.

Related document: [Reviewer guide - Gemini CLI](../../reviewer-guide.md#path-b-gemini-cli-as-an-mcp-compatible-ai-client)

## 6. Gemini CLI model-selected tool execution

![Gemini CLI requesting hosted tool execution](05-gemini-tool-execution.png)

**Demonstrates:** the model interpreted a natural-language request, selected `list_demo_cases`, and requested execution from the `commerce-ops-hosted` MCP server before investigating the order.

**Reviewer should notice:** the client asks for permission to run the real hosted MCP tool rather than answering from memorized scenario text.

**Redaction:** no credential is shown.

## 7. Gemini CLI grounded result

![Gemini CLI grounded ORD-1042 result](06-gemini-grounded-result.png)

**Demonstrates:** the independent AI client called the approved tools using fresh UUID-based identifiers and returned the deterministic workflow result.

**Reviewer should notice:**

- diagnosis `ASSIGNED_WAREHOUSE_OUT_OF_STOCK`;
- matched deterministic rule;
- assigned warehouse `WH-A` with zero available stock;
- eligible alternative `WH-B`;
- suggested queue `FULFILMENT_OPERATIONS`;
- human review rather than automatic mutation;
- `commerceStateChanged=false`.

**Redaction:** no bearer token, model key, or environment file is visible.

## Evidence integrity notes

- Screenshots are included only as supporting visual evidence; the automated verification code and Markdown reports remain the primary reproducible record.
- Images were not edited to change tool names, outputs, identifiers, results, or status. Only safe cropping/redaction was permitted.
- The full reviewer workflow is documented in [Reviewer guide](../../reviewer-guide.md).
- The distinction between direct MCP verification and model-backed client verification is explained in [Final evaluation](../../final-evaluation.md).
