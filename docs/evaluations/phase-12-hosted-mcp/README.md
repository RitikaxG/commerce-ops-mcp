# Phase 12 hosted evidence

Store only concise, redacted Markdown evidence in this directory.

## Required evidence after deployment

1. Provider-independent hosted verifier summary.
2. MCP Inspector summary showing Streamable HTTP connection, five tools, `ORD-1042` investigation, escalation, review read, and trace read.
3. Focused nine-scenario hosted AI-verifier summary.
4. One representative MCP-compatible AI-client result.
5. Health, deployment timestamp, deployed commit SHA, AWS region, last verification timestamp, and intended shutdown timestamp.
6. Evidence that `commerceStateChanged=false`.
7. A provider-rate-limit or quota note, when encountered, plus a subsequent provider-independent MCP verification.

## Redaction rules

Do not commit:

- bearer-token values or complete Authorization headers;
- Gemini keys or raw provider payloads;
- PostgreSQL URLs, role passwords, or environment-file contents;
- SSH private keys;
- public-IP details that are not required by the report;
- unredacted screenshots;
- raw terminal logs or model transcripts.

Convert useful output into a small Markdown table or a redacted JSON excerpt. Replace secrets with `<redacted>` and omit request headers entirely when possible.

## Suggested hosted direct evidence

```text
Command: bun --env-file=.env.local run verify:hosted:mcp
Status: PASS
Transport: Streamable HTTP
Tools: 5
Synthetic scenarios advertised: 9
Representative order: ORD-1042
Review case read: PASS
Trace read: PASS
commerceStateChanged: false
Model provider required: false
Timestamp: <UTC timestamp>
```

## Suggested hosted AI evidence

```text
Command: bun --env-file=.env.local run verify:hosted:ai
Status: PASS or MODEL_PROVIDER failure
Hosted MCP preflight: PASS
Provider: gemini
Scenarios completed: <0-9>
Sequential provider requests: true
commerceStateChanged: false
Timestamp: <UTC timestamp>
```

When the provider returns `RATE_LIMITED` or `QUOTA_EXHAUSTED`, record the code and immediately run the direct hosted verifier. The evidence must make clear that provider unavailability did not make the MCP unavailable.

## Inspector screenshot checklist

Before committing any screenshot:

- crop out the token/header control;
- remove browser history, bookmarks, account identifiers, and unrelated tabs;
- verify no environment file or terminal secret is visible;
- show only the endpoint domain, selected tool, safe tool arguments, and structured result;
- prefer a Markdown summary when the screenshot adds no unique evidence.
