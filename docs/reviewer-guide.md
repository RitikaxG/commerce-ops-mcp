# Reviewer Guide

This guide verifies the deployed commerce-operations MCP without cloning or running the repository locally.

## Hosted endpoints

```text
Health: https://commerce-mcp.ritikaxg.co.in/health
MCP:    https://commerce-mcp.ritikaxg.co.in/mcp
Transport: Streamable HTTP
```

The health endpoint is public. The MCP endpoint requires the reviewer bearer token supplied through a secure, expiring share link.

## Security guidance

- Do not paste the reviewer token into screenshots, source control, shared logs, or issue comments.
- Do not commit an MCP client configuration containing the token.
- Keep the token only for the review window.
- The repository owner will revoke or rotate the token after review.
- When capturing evidence, crop the token/header control and unrelated account details.

## Path A: MCP Inspector

### 1. Start Inspector

From a trusted local machine:

```bash
npx @modelcontextprotocol/inspector@latest
```

Configure:

```text
Transport: Streamable HTTP
URL: https://commerce-mcp.ritikaxg.co.in/mcp
Header: Authorization: Bearer <reviewer-token>
```

The server configuration used during verification is shown below. The token control is intentionally excluded.

![Inspector server configuration](evidence/final-submission/01-inspector-connection.png)

### 2. Confirm the exact tool catalog

After connecting, Inspector should show exactly:

1. `list_demo_cases`
2. `investigate_order_exception`
3. `create_human_review_escalation`
4. `get_review_case`
5. `get_investigation_trace`

No commerce mutation, SQL, reset, cleanup, or unrestricted HTTP tool should be present.

![Inspector exact five-tool catalog](evidence/final-submission/02-inspector-five-tools.png)

### 3. Discover the synthetic cases

Call:

```text
list_demo_cases
```

The result should list the nine approved order IDs `ORD-1042` through `ORD-1050`.

### 4. Investigate `ORD-1042`

Generate fresh UUID-based values for each new logical investigation. On macOS or Linux, `uuidgen` can be used locally; the value does not need to be shared with the repository owner.

Call:

```text
investigate_order_exception
```

Example input:

```json
{
  "orderId": "ORD-1042",
  "clientRequestId": "reviewer-request-<fresh-uuid>",
  "idempotencyKey": "investigate-ORD-1042-<fresh-uuid>"
}
```

Identifier rules:

- Generate a new `clientRequestId` for every new logical investigation.
- Generate a new `idempotencyKey` for every new investigation.
- Reuse both values only when retrying the exact same request with the same arguments.
- Reusing a key with different arguments is rejected safely.

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

### 5. Create the human-review escalation

Copy the returned `investigationId`, then call:

```text
create_human_review_escalation
```

Example input:

```json
{
  "investigationId": "<returned-investigation-id>",
  "idempotencyKey": "escalate-<fresh-uuid>"
}
```

The server derives the order, reason, queue, evidence summary, and next step from the persisted investigation. The caller cannot supply or override those business fields.

### 6. Read the case and trace

Use the returned identifiers:

```text
get_review_case
```

```json
{
  "reviewCaseId": "<returned-review-case-id>"
}
```

Then call:

```text
get_investigation_trace
```

```json
{
  "investigationId": "<returned-investigation-id>"
}
```

The trace should include the persisted investigation, immutable decision-time evidence snapshot, and ordered safe audit events.

![Inspector persisted trace result](evidence/final-submission/03-inspector-trace.png)

## Path B: Gemini CLI as an MCP-compatible AI client

This path demonstrates that an external model-backed client can discover and select the same hosted tools. The model-provider credential remains with the client; no Gemini key is stored on the EC2 MCP server.

### 1. Start Gemini CLI

Use a supported Gemini CLI authentication method owned by the reviewer:

```bash
npx -y @google/gemini-cli@latest
```

Exit after authentication if the MCP server still needs to be configured.

### 2. Load the reviewer token without printing it

In zsh:

```bash
read -s "MCP_REVIEWER_TOKEN?Reviewer token: "
export MCP_REVIEWER_TOKEN
echo
```

Do not run `echo $MCP_REVIEWER_TOKEN`.

### 3. Add the hosted MCP server to the local user configuration

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

This stores the server only in the reviewer's local user configuration, not in the repository. Remove it after testing.

### 4. Confirm tool discovery

Start Gemini CLI and run:

```text
/mcp
```

Expected status:

```text
commerce-ops-hosted - Ready (5 tools)
```

![Gemini CLI showing the hosted MCP ready](evidence/final-submission/04-gemini-mcp-ready.png)

### 5. Ask the AI client to use the hosted tools

Use this prompt:

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

Approve the requested MCP calls. Expected order:

```text
list_demo_cases
-> investigate_order_exception
```

![Gemini CLI requesting hosted MCP tool execution](evidence/final-submission/05-gemini-tool-execution.png)

Expected grounded answer:

```text
diagnosis: ASSIGNED_WAREHOUSE_OUT_OF_STOCK
assigned warehouse: WH-A
eligible alternative: WH-B
queue: FULFILMENT_OPERATIONS
next step: human review of warehouse reassignment
commerceStateChanged: false
```

![Gemini CLI grounded ORD-1042 result](evidence/final-submission/06-gemini-grounded-result.png)

### 6. Remove local access after review

```bash
npx -y @google/gemini-cli@latest mcp remove \
  --scope user \
  commerce-ops-hosted

unset MCP_REVIEWER_TOKEN
```

## Optional high-value cases

A reviewer does not need to run all nine scenarios manually. These three cases demonstrate important safety behavior:

| Order | What it demonstrates | Expected result |
| --- | --- | --- |
| `ORD-1046` | Required inventory evidence is absent | `NEEDS_MORE_INFO`, no diagnosis, `OPERATIONS_DATA_REVIEW` |
| `ORD-1049` | Operator context is not treated as source-of-truth payment evidence | `PAYMENT_NOT_CONFIRMED`, `PAYMENT_OPERATIONS` |
| `ORD-1050` | Persisted inventory sources conflict | `NEEDS_MORE_INFO`, no diagnosis, `OPERATIONS_DATA_REVIEW` |

## Troubleshooting

| Symptom | Check |
| --- | --- |
| HTTP 401 `MCP_AUTH_REQUIRED` | Authorization header is missing |
| HTTP 401 `MCP_AUTH_INVALID` | Token is malformed, expired, or incorrect |
| HTTP 403 `MCP_HOST_NOT_ALLOWED` | Use the public hostname exactly as shown above |
| Client shows no tools | Reconnect and verify Streamable HTTP plus the bearer header |
| Idempotency reuse error | Generate fresh UUIDs for a new logical request |
| Gemini provider error | The hosted MCP may still be healthy; confirm `/health` and test through Inspector |

The full hosted verification report is available at [Hosted MCP Verification Report](evidence/final-submission/00-hosted-mcp-verification-report.pdf).
