# How to Use the Phase Prompts

## Purpose

The final plan divides implementation into isolated review gates. Use this protocol with the stored final plan and the prompt for exactly one phase.

This file is an operating guide, not a substitute for the full copy-paste prompt for each phase.

## Source order

Use the project sources in this order:

1. `AGENTS.md` for permanent boundaries, current decisions, and phase status.
2. `README.md` for the concise implementation and verification summary.
3. `docs/plans/Diligence_AI_Commerce_Operations_Final_Plan_Updated.pdf` for the final product, architecture, schema proposal, scenarios, and phase sequence.
4. The single prompt for the phase currently authorized.
5. The current phase evaluation report once the coding session has produced it.

After client acceptance in Phase 1, `docs/database/schema-proposal.md` becomes the implementation source of truth for database work. A later phase must not silently diverge from it.

## Session protocol

1. Start with Phase 0. Do not skip ahead.
2. Use only one phase prompt in a coding session.
3. Require the coding model to read the repository, `AGENTS.md`, the README status table, the final plan, and relevant completed evaluation reports before editing.
4. Keep all changes inside the active phase scope.
5. Run the commands reported by the coding model yourself and inspect their key output.
6. Review:
   - `docs/evaluations/phase-XX.md`
   - `AGENTS.md`
   - the README implementation-status table
   - representative output, IDs, traces, or UI relevant to the phase
7. Reply with requested changes or approve the phase.
8. Start the next phase in a new coding session only after acceptance.

Do not interpret "complete" in a coding response as phase acceptance. Acceptance happens only after the review above.

## Phase 1 schema gate

Phase 1 is deliberately limited to schema design and client review.

It must produce:

- `docs/database/schema-proposal.md`
- `docs/database/client-review-summary.md`
- entities and columns
- relationships and an ERD
- statuses and outcome codes
- invariants and constraints
- database permissions
- required indexes
- rationale and trade-offs
- walkthroughs for `ORD-1042` and a `NEEDS_MORE_INFO` case
- `docs/evaluations/phase-01.md`

Until the client accepts that proposal:

- Mark Phase 1 as `Awaiting client schema approval`.
- Do not scaffold later application packages.
- Do not create Prisma migrations.
- Do not implement the AI or MCP layer.
- Do not proceed to Phase 2.

## End-of-phase review checklist

- Scope matches only the requested phase.
- Repository was inspected before edits.
- Reported commands were run and their important output was inspected.
- Expected and actual results are both recorded.
- Safety guardrails relevant to the phase were exercised.
- Sample output, identifiers, or trace evidence is included when applicable.
- Known limitations describe current limitations only.
- Any changed decision is explicit and dated.
- `AGENTS.md`, README, and the phase evaluation report agree.
- The exit decision is `Accepted` or `Needs revision`.
- No work from the next phase was included.

## Evaluation report template

Create one report per phase at `docs/evaluations/phase-XX.md`.

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

## Status-table rules

- `Not started`: no phase work has begun.
- `In progress`: phase work is active but its review packet is incomplete.
- `Awaiting review`: phase outputs and evidence are complete but require explicit reviewer acceptance.
- `Awaiting client schema approval`: Phase 1 documents are complete but not accepted.
- `Needs revision`: review found required changes.
- `Complete`: the phase outputs and evaluation evidence have been reviewed and accepted.

Do not link to an evaluation report until that report exists. Do not mark a phase complete merely because automated checks passed.

## Current handoff

Phases 0 and 1 are accepted. Phase 2 is implemented on `phase/02-turborepo-foundation` and is awaiting review. Review `docs/evaluations/phase-02.md`, `AGENTS.md`, the README status table, the `/health` output, package names, dependency direction, and no-`src/` compliance. Phase 3 remains blocked until explicit Phase 2 acceptance and a new session with only the Phase 3 prompt.
