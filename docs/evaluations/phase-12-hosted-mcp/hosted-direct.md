# Hosted provider-independent MCP evidence

- Date: 2026-08-01
- Region: `ap-south-1`
- Initial deployed commit: `6498a09647e0da90b7197a7becc1163c87c8cf85`
- Health URL: `https://commerce-mcp.ritikaxg.co.in/health`
- MCP URL: `https://commerce-mcp.ritikaxg.co.in/mcp`
- Transport: Streamable HTTP
- Authentication: shared bearer token, redacted
- Command: `bun --env-file=.env.local run verify:hosted:mcp`
- Status: PASS

## Verified

- Public `GET /health` returned `{ "status": "ok" }`.
- Authenticated MCP initialization and tool discovery succeeded.
- Exactly five approved tools were advertised.
- The catalog contained the existing nine synthetic scenarios.
- Representative order `ORD-1042` produced the accepted deterministic diagnosis.
- Investigation, escalation, review-case read, and trace read succeeded.
- Unknown-order handling failed safely.
- No commerce mutation tool was present.
- `commerceStateChanged=false`.
- `modelProviderRequired=false`.

No model-provider key was present on EC2 or required by this verification.
