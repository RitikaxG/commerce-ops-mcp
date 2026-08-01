# MCP Inspector Evidence

- Date: 2026-08-01
- Client: MCP Inspector v2
- Endpoint: `https://commerce-mcp.ritikaxg.co.in/mcp`
- Transport: Streamable HTTP
- Authentication: shared bearer token, redacted
- Status: **PASS**

## Tool discovery

Exactly these five tools were visible:

1. `list_demo_cases`
2. `investigate_order_exception`
3. `create_human_review_escalation`
4. `get_review_case`
5. `get_investigation_trace`

No commerce mutation, SQL, reset, cleanup, or unrestricted HTTP tool was visible.

![Inspector exact five-tool discovery](../../evidence/final-submission/02-inspector-five-tools.jpg)

## Representative workflow

- `list_demo_cases` returned the approved demo catalog.
- `investigate_order_exception` completed for `ORD-1042` using fresh reviewer identifiers.
- Diagnosis: `ASSIGNED_WAREHOUSE_OUT_OF_STOCK`.
- Assigned warehouse: `WH-A`.
- Eligible alternative warehouse: `WH-B`.
- Suggested queue: `FULFILMENT_OPERATIONS`.
- A human-review escalation was created from the returned investigation ID.
- The resulting review case was retrieved.
- The persisted investigation trace and immutable evidence snapshot were retrieved.
- Structured results reported `commerceStateChanged=false`.

## Security evidence

The bearer-token control and complete Authorization header were excluded from the retained evidence.

## Reproduction

See [Reviewer guide - MCP Inspector](../../reviewer-guide.md#path-a-mcp-inspector) for exact inputs, identifier rules, expected results, and trace-read steps. The [final evidence index](../../evidence/final-submission/README.md) contains the representative redacted screenshot and verification report.
