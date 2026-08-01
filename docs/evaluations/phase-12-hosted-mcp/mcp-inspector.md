# MCP Inspector evidence

- Date: 2026-08-01
- Client: MCP Inspector v2
- Endpoint: `https://commerce-mcp.ritikaxg.co.in/mcp`
- Transport: Streamable HTTP
- Authentication: shared bearer token, redacted
- Status: PASS

## Tool discovery

Exactly these five tools were visible:

1. `list_demo_cases`
2. `investigate_order_exception`
3. `create_human_review_escalation`
4. `get_review_case`
5. `get_investigation_trace`

## Representative workflow

- `list_demo_cases` returned the approved demo catalog.
- `investigate_order_exception` completed for `ORD-1042`.
- Diagnosis: `ASSIGNED_WAREHOUSE_OUT_OF_STOCK`.
- Suggested queue: `FULFILMENT_OPERATIONS`.
- A human-review escalation was created from the returned investigation ID.
- The resulting review case was retrieved.
- The persisted investigation trace and evidence were retrieved.
- Structured results reported `commerceStateChanged=false`.

The bearer-token control and Authorization header were excluded from retained evidence.
