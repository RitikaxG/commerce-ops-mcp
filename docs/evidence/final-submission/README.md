# Final Submission Evidence

This directory contains concise, redacted evidence for the two required hosted-client verification paths:

1. MCP Inspector for protocol, tool discovery, and manual workflow inspection.
2. Gemini CLI as an independent MCP-compatible AI client.

No bearer token, model-provider key, database URL, SSH material, or complete Authorization header is included.

## Hosted verification report

[Download the Hosted MCP Verification Report](00-hosted-mcp-verification-report.pdf)

**Demonstrates:** PASS status for the hosted endpoint, Streamable HTTP transport, bearer authentication boundary, MCP Inspector verification, independent AI-client verification, and `commerceStateChanged=false`.

## MCP Inspector: exact tool discovery

![MCP Inspector exact five-tool catalog](02-inspector-five-tools.jpg)

**Demonstrates:** successful connection to the hosted MCP and discovery of exactly these five approved tools:

- `list_demo_cases`
- `investigate_order_exception`
- `create_human_review_escalation`
- `get_review_case`
- `get_investigation_trace`

**Reviewer should notice:** no commerce mutation, SQL, reset, cleanup, or unrestricted HTTP tool is exposed.

## MCP-compatible AI client: grounded workflow result

![Gemini CLI grounded ORD-1042 result](06-gemini-grounded-result.jpg)

**Demonstrates:** an independent model-backed MCP client selected the hosted tools and returned the deterministic `ORD-1042` result.

**Reviewer should notice:**

- tool calls to `list_demo_cases` and `investigate_order_exception`;
- fresh UUID-based reliability identifiers;
- diagnosis `ASSIGNED_WAREHOUSE_OUT_OF_STOCK`;
- assigned warehouse `WH-A` with zero available stock;
- eligible alternative `WH-B`;
- queue `FULFILMENT_OPERATIONS`;
- human review rather than automatic mutation;
- `commerceStateChanged=false`.

## Reproducibility

The screenshots are supporting visual evidence. The reproducible testing steps are in the [Reviewer Guide](../../reviewer-guide.md), and the layered automated/manual results are summarized in the [Final Evaluation](../../final-evaluation.md).

Only safe cropping and compression were applied. Tool names, identifiers, outputs, and status were not altered.
