# MCP Inspector Evidence

- Date: 2026-08-01
- Client: MCP Inspector v2
- Endpoint: `https://commerce-mcp.ritikaxg.co.in/mcp`
- Transport: Streamable HTTP
- Authentication: shared bearer token, redacted
- Status: **PASS**

## Authenticated server configuration

The hosted HTTPS endpoint was configured as a Streamable HTTP MCP server with the bearer header supplied privately.

![MCP Inspector authenticated server configuration](../../../images/include-header-in-server-settings.png)

## Tool discovery

Exactly these five tools were visible:

1. `list_demo_cases`
2. `investigate_order_exception`
3. `create_human_review_escalation`
4. `get_review_case`
5. `get_investigation_trace`

No commerce mutation, SQL, reset, cleanup, or unrestricted HTTP tool was visible.

![Inspector exact five-tool discovery](../../../images/all-tools-rendered.png)

## Representative workflow

The reviewer selected `investigate_order_exception` for `ORD-1042` and supplied fresh UUID-based reliability identifiers.

![Inspector investigation request](../../../images/investigate-an-order.png)

The hosted workflow returned:

- diagnosis: `ASSIGNED_WAREHOUSE_OUT_OF_STOCK`;
- assigned warehouse: `WH-A`;
- eligible alternative warehouse: `WH-B`;
- suggested queue: `FULFILMENT_OPERATIONS`;
- human review rather than an automatic operational change;
- `commerceStateChanged=false`.

![Inspector grounded investigation result](../../../images/investigation-result.png)

The broader Inspector run also verified the demo catalog, human-review escalation, review-case read, and investigation-trace read.

## Security evidence

The reviewer token value, model-provider key, database credentials, and SSH material are not shown in the committed evidence.

## Reproduction

See [Reviewer guide - MCP Inspector](../../reviewer-guide.md#path-a-mcp-inspector) for exact inputs, identifier rules, expected results, and trace-read steps. The [final evidence index](../../evidence/final-submission/README.md) contains the complete visual sequence and verification report.
