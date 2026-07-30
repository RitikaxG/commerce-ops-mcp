# Phase Evaluation Reports

Create one report per phase at `docs/evaluations/phase-XX.md`.

The coding session records evidence and a recommended exit decision. A phase remains `Awaiting review` until the reviewer explicitly accepts it or requests revisions.

## Report template

```md
# Phase XX Evaluation Report

## Goal

## Scope implemented

## Files and packages changed

## Automated checks

| Command | Expected | Actual | Result |
| ------- | -------- | ------ | ------ |

## Manual verification

## Guardrails verified

## Sample output / IDs / trace evidence

## Known limitations

## Decisions changed during review

## Exit decision

Accepted / Needs revision
```

## Evidence rules

- Record the exact command that ran, not an equivalent command that was not exercised.
- Summarize important actual output; do not paste long raw logs.
- Distinguish automated checks from manual review.
- State when a check is not applicable and why.
- Do not claim runtime, database, MCP, model, deployment, or UI evidence before that capability exists.
- List current limitations only.
- Keep the report, `AGENTS.md`, and the README status table consistent.
- In the final phase handoff, list every updated file grouped by app/package/documentation area.

## Exit semantics

- `Accepted`: the implemented phase scope and evidence satisfy its exit criteria.
- `Needs revision`: a required output, check, guardrail, or decision remains unresolved.

The report's exit decision is the coding session's evidence-based recommendation. The reviewer makes the project gate decision and then updates the phase status to `Complete` or `Needs revision`.
