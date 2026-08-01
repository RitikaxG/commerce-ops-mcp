# Phase 12 Hosted Evidence

This directory stores concise, redacted Markdown evidence for the hosted deployment. The complete visual evidence package is available at:

- [Final submission evidence](../../evidence/final-submission/README.md)
- [Hosted verification PDF](../../evidence/final-submission/00-hosted-mcp-verification-report.pdf)
- [Final evaluation](../../final-evaluation.md)
- [Reviewer guide](../../reviewer-guide.md)

## Completed evidence

- [Hosted provider-independent MCP](hosted-direct.md)
- [MCP Inspector](mcp-inspector.md)
- [Hosted model-backed and Gemini CLI verification](hosted-ai.md)
- [Hosted database verification boundary](database-verification.md)

## Verified deployment summary

1. Provider-independent hosted verifier: PASS.
2. MCP Inspector: PASS over Streamable HTTP with exactly five tools.
3. Hosted nine-scenario AI verifier: PASS.
4. Gemini CLI as an independent MCP-compatible AI client: PASS.
5. Public HTTPS health: PASS.
6. `commerceStateChanged=false`: verified in direct, Inspector, and model-backed paths.
7. Runtime API credential isolation: verified.
8. Final deployed application SHA: `3ac6c89da3f7d7675256c23cc65e257e4e10892b`.
9. Final Phase 12 branch head: `daa0a7e89ef0fc509b803c5c2c24b2602f801042`.
10. Phase 12 merge commit: `c4fb3eed9aa6a9a14d42f33087f86099fe12382b`.
11. AWS region: `ap-south-1`.
12. Intended review availability: through at least 9 August 2026 or until client review completes.

## Redaction rules

Do not commit:

- bearer-token values or complete Authorization headers;
- Gemini keys or raw provider payloads;
- PostgreSQL URLs, role passwords, or environment-file contents;
- SSH private keys;
- unredacted screenshots;
- raw terminal logs or hidden model reasoning.

Useful output should be reduced to a small Markdown table, safe JSON excerpt, or redacted screenshot. Replace secret values with placeholders such as `<reviewer-token>` and omit request headers where possible.

## Reviewer identifier guidance

For `investigate_order_exception`:

- choose `orderId` from `list_demo_cases`;
- generate a new UUID-based `clientRequestId` for each new logical request;
- generate a new UUID-based `idempotencyKey` for each new investigation;
- reuse both values only when retrying the exact same request.

For `create_human_review_escalation`, use the returned `investigationId`, generate a new idempotency key, and reuse it only for retrying that same escalation.

## Screenshot checklist

Before retaining any screenshot:

- crop out the token/header control;
- remove browser history, bookmarks, account identifiers, and unrelated tabs when they add no evidence;
- verify that no environment file or terminal secret is visible;
- show only the endpoint domain, selected tool, safe arguments, structured result, or client tool activity;
- do not edit tool names, inputs, outputs, identifiers, status, or results.
