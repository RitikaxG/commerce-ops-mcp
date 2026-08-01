# Phase 12 hosted evidence

Store only concise, redacted Markdown evidence in this directory.

## Completed evidence

- [Hosted provider-independent MCP](hosted-direct.md)
- [MCP Inspector](mcp-inspector.md)
- [Hosted model-backed verification](hosted-ai.md)
- [Hosted database verification boundary](database-verification.md)

## Verified deployment summary

1. Provider-independent hosted verifier: PASS.
2. MCP Inspector: PASS over Streamable HTTP with exactly five tools.
3. Focused nine-scenario hosted AI verifier: PASS.
4. Public HTTPS health: PASS.
5. `commerceStateChanged=false`: verified in direct, Inspector, and model-backed paths.
6. Runtime API credential isolation: verified.
7. Initial deployed SHA: `6498a09647e0da90b7197a7becc1163c87c8cf85`.
8. AWS region: `ap-south-1`.
9. Intended review availability: through at least 2026-08-09 or until client review completes.

## Redaction rules

Do not commit:

- bearer-token values or complete Authorization headers;
- Gemini keys or raw provider payloads;
- PostgreSQL URLs, role passwords, or environment-file contents;
- SSH private keys;
- unredacted screenshots;
- raw terminal logs or model transcripts.

Convert useful output into a small Markdown table or a redacted JSON excerpt. Replace secrets with `<redacted>` and omit request headers entirely when possible.

## Reviewer identifier guidance

For `investigate_order_exception`:

- choose `orderId` from `list_demo_cases`;
- generate a new UUID-based `clientRequestId` for each new logical request;
- generate a new UUID-based `idempotencyKey` for each new investigation;
- reuse both values only when retrying the exact same request.

For `create_human_review_escalation`, use the returned `investigationId`, generate a new idempotency key, and reuse it only for retrying that same escalation.

## Inspector screenshot checklist

Before retaining any screenshot:

- crop out the token/header control;
- remove browser history, bookmarks, account identifiers, and unrelated tabs;
- verify no environment file or terminal secret is visible;
- show only the endpoint domain, selected tool, safe tool arguments, and structured result;
- prefer the Markdown summaries in this directory when the screenshot adds no unique evidence.
