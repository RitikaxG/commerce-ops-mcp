# Hosted Model-Backed and MCP-Compatible Client Evidence

## Hosted nine-scenario evaluator

- Date: 2026-08-01
- Command: `bun --env-file=.env.local run verify:hosted:ai`
- Provider: Gemini from a trusted local client
- Hosted MCP preflight: PASS
- Status: **PASS**

### Result

- Approved scenarios completed: 9 of 9
- Provider requests were sequential: true
- Model calls: 18
- Input tokens: 10,907
- Output tokens: 969
- Total tokens: 13,007
- `commerceStateChanged=false`
- `hostedMcpVerifiedBeforeProviderCalls=true`
- Duration: approximately 187 seconds

The model provider was used only for natural-language interaction and approved tool selection. Deterministic workflow results remained authoritative. The Gemini key remained local and was not installed on EC2.

## Independent Gemini CLI verification

- Date: 2026-08-01
- Client: Gemini CLI v0.53.1
- MCP server name: `commerce-ops-hosted`
- Endpoint: `https://commerce-mcp.ritikaxg.co.in/mcp`
- Transport: Streamable HTTP
- Authentication: shared bearer token, redacted
- Status: **PASS**

Gemini CLI's `/mcp` view reported:

```text
commerce-ops-hosted - Ready (5 tools)
```

It discovered the same five hosted tools:

1. `list_demo_cases`
2. `investigate_order_exception`
3. `create_human_review_escalation`
4. `get_review_case`
5. `get_investigation_trace`

![Gemini CLI hosted MCP discovery](../../evidence/final-submission/04-gemini-mcp-ready.png)

The client received a natural-language request to use only the hosted MCP, list the demo cases, and investigate `ORD-1042` with fresh UUID-based identifiers. It selected the correct ordered tool sequence:

```text
list_demo_cases
-> investigate_order_exception
```

![Gemini CLI model-selected tool call](../../evidence/final-submission/05-gemini-tool-execution.png)

The final grounded result preserved the deterministic workflow output:

```text
diagnosis: ASSIGNED_WAREHOUSE_OUT_OF_STOCK
matched rule: assigned_warehouse_out_of_stock.v1
assigned warehouse: WH-A
required quantity: 1
available quantity: 0
eligible alternative: WH-B
suggested queue: FULFILMENT_OPERATIONS
recommended next step: review reassignment; do not change commerce automatically
commerceStateChanged: false
```

![Gemini CLI grounded result](../../evidence/final-submission/06-gemini-grounded-result.png)

## Boundary demonstrated

The two model-backed paths verify different concerns:

- The hosted evaluator proves all nine frozen scenarios through the repository's provider-neutral AI host.
- Gemini CLI proves that an independent MCP-compatible AI client can discover and select the same remote tools.

Neither path moves evidence readiness, diagnosis, escalation policy, persistence, or commerce mutation into the model.

## Reproduction

See [Reviewer guide - Gemini CLI](../../reviewer-guide.md#path-b-gemini-cli-as-an-mcp-compatible-ai-client).
