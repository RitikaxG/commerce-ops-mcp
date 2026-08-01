# Reviewer Guide

This guide verifies the deployed commerce-operations MCP without cloning or running the repository locally.

## Hosted endpoints

```text
Health: https://commerce-mcp.ritikaxg.co.in/health
MCP: https://commerce-mcp.ritikaxg.co.in/mcp
Transport: Streamable HTTP
```

The health endpoint is public. The MCP endpoint requires the bearer token supplied through a secure, expiring share link.

## Security guidance

- Do not include the reviewer token in screenshots, source control, shared logs, or issue comments.
- Do not commit an MCP client configuration containing the token.
- The repository owner will revoke or rotate the token after review.

## Path A: MCP Inspector

### 1. Start Inspector

```bash
npx @modelcontextprotocol/inspector@latest
```

Configure:

```text
Transport: Streamable HTTP
URL: https://commerce-mcp.ritikaxg.co.in/mcp
Header: Authorization: Bearer <reviewer-token>
```

![MCP Inspector server settings with the authenticated remote endpoint](../images/include-header-in-server-settings.png)

### 2. Confirm the exact tool catalog

Inspector should show exactly:

1. `list_demo_cases`
2. `investigate_order_exception`
3. `create_human_review_escalation`
4. `get_review_case`
5. `get_investigation_trace`

No commerce mutation, SQL, reset, cleanup, or unrestricted HTTP tool should be present.

![MCP Inspector showing all five approved tools](../images/all-tools-rendered.png)

### 3. Discover the synthetic cases

Call `list_demo_cases`. The result should list `ORD-1042` through `ORD-1050`.

### 4. Investigate `ORD-1042`

Call `investigate_order_exception` with:

```json
{
  "orderId": "ORD-1042",
  "clientRequestId": "reviewer-request-<fresh-uuid>",
  "idempotencyKey": "investigate-ORD-1042-<fresh-uuid>"
}
```

Generate fresh UUID-based values for every new logical investigation. Reuse the same values only when retrying that exact request with the same arguments.

![MCP Inspector investigation request for ORD-1042](../images/investigate-an-order.png)

Expected result:

```text
diagnosisCode: ASSIGNED_WAREHOUSE_OUT_OF_STOCK
assigned warehouse: WH-A
required quantity: 1
available quantity at WH-A: 0
eligible alternative warehouse: WH-B
suggestedQueue: FULFILMENT_OPERATIONS
commerceStateChanged: false
```

![MCP Inspector grounded investigation result](../images/investigation-result.png)

### 5. Create and inspect the human-review case

Use the returned `investigationId`:

```json
{
  "investigationId": "<returned-investigation-id>",
  "idempotencyKey": "escalate-<fresh-uuid>"
}
```

Call `create_human_review_escalation`, then use the returned IDs with:

```text
get_review_case
afterward: get_investigation_trace
```

The server derives the order, reason, queue, evidence summary, and next step from the persisted investigation. The caller cannot override those fields.

## Path B: Gemini CLI as an MCP-compatible AI client

This verifies that an independent model-backed client can discover and select the hosted tools. The model-provider credential remains with the client; no Gemini key is stored on EC2.

### 1. Start and authenticate Gemini CLI

```bash
npx -y @google/gemini-cli@latest
```

Use a supported authentication method owned by the reviewer.

### 2. Load the reviewer token without printing it

In zsh:

```bash
read -s "MCP_REVIEWER_TOKEN?Reviewer token: "
export MCP_REVIEWER_TOKEN
echo
```

### 3. Add the hosted MCP server

```bash
npx -y @google/gemini-cli@latest mcp remove \
  --scope user \
  commerce-ops-hosted 2>/dev/null || true

npx -y @google/gemini-cli@latest mcp add \
  --scope user \
  --transport http \
  --header "Authorization: Bearer ${MCP_REVIEWER_TOKEN}" \
  commerce-ops-hosted \
  https://commerce-mcp.ritikaxg.co.in/mcp
```

### 4. Confirm discovery and run the workflow

Inside Gemini CLI, run `/mcp` and confirm `commerce-ops-hosted` is ready with five tools. Then use:

```text
Use only the commerce-ops-hosted MCP server for this task.

First call list_demo_cases.

Then investigate ORD-1042. Generate fresh UUID-based values for
clientRequestId and idempotencyKey.

Do not create an escalation.

Report:
- the MCP tools called;
- the grounded diagnosis;
- the supporting evidence;
- the suggested queue;
- the recommended next step;
- whether commerceStateChanged is false.
```

Expected tool order:

```text
list_demo_cases
-> investigate_order_exception
```

The captured result shows the independent client using the hosted MCP and returning the deterministic diagnosis, supporting evidence, queue, safe recommendation, and `commerceStateChanged=false`.

![Gemini CLI using the hosted MCP to answer ORD-1042](../images/gemini-client-using-mcp-to-respond.png)

### 5. Remove local access after review

```bash
npx -y @google/gemini-cli@latest mcp remove \
  --scope user \
  commerce-ops-hosted

unset MCP_REVIEWER_TOKEN
```

## Automated model-backed verification

The repository also ran the hosted nine-scenario model-backed evaluator against the same remote MCP endpoint.

![Hosted model-backed evaluation result](../images/model-backed-evaluation.png)

## Optional high-value cases

| Order | What it demonstrates | Expected result |
| --- | --- | --- |
| `ORD-1046` | Required inventory evidence is absent | `NEEDS_MORE_INFO`, no diagnosis, `OPERATIONS_DATA_REVIEW` |
| `ORD-1049` | Operator context is not authoritative payment evidence | `PAYMENT_NOT_CONFIRMED`, `PAYMENT_OPERATIONS` |
| `ORD-1050` | Persisted inventory sources conflict | `NEEDS_MORE_INFO`, no diagnosis, `OPERATIONS_DATA_REVIEW` |

## Troubleshooting

| Symptom | Check |
| --- | --- |
| HTTP 401 `MCP_AUTH_REQUIRED` | Authorization header is missing |
| HTTP 401 `MCP_AUTH_INVALID` | Token is malformed, expired, or incorrect |
| HTTP 403 `MCP_HOST_NOT_ALLOWED` | Use the public hostname exactly as shown above |
| Client shows no tools | Reconnect and verify Streamable HTTP plus the bearer header |
| Idempotency reuse error | Generate fresh UUIDs for a new logical request |
| Gemini provider error | Confirm `/health`; the deterministic MCP may still be available through Inspector |

The concise verification report is available at [Hosted MCP Verification Report](evidence/final-submission/00-hosted-mcp-verification-report.pdf).
