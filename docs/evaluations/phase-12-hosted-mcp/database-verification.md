# Hosted database verification note

The clean deployment initially passed `db:verify-access` with six tests and zero failures after migrations, access setup, seeding, and demo verification.

After hosted MCP, Inspector, and model-backed evaluations intentionally persisted investigations, evidence, escalations, idempotency records, and audit events, the clean-state command reported one failure:

```text
one valid operations transaction leaves commerce unchanged
```

The role permission matrix continued to pass. The failure came from a Phase 4 clean-state assertion that expected the entire operations schema to contain zero rows after its own transaction rolled back. That assumption is intentionally true in clean CI but not on an active hosted review database.

Phase 12 therefore adds:

```bash
bun run db:verify-access:hosted
```

The hosted-safe command:

- reruns the workflow and demo role permission matrix;
- records existing workflow counts and commerce fingerprints;
- executes one valid operations transaction;
- rolls the transaction back;
- proves commerce fingerprints are unchanged;
- proves existing workflow counts are unchanged.

This preserves the original clean-state regression while allowing safe verification during the client review window without deleting evidence.
