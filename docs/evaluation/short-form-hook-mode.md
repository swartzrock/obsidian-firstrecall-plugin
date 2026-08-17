---
title: Short-Form Hook Mode Evaluation Checklist
type: evaluation
date: 2026-06-21
source_plan: docs/plans/2026-06-19-001-feat-short-form-hook-mode-plan.md
---

# Short-Form Hook Mode Evaluation Checklist

Use this checklist after Hook Mode is available in the Cornell card display. It is a manual, repeatable evaluation artifact only: do not change provider instructions, schemas, cache shape, migrations, or production generation behavior while running it.

## Evaluation Goal

Decide whether deterministic hook titles are good enough for Hook Mode, need tighter deterministic transforms, or need a separate future provider-contract plan for generated hook copy.

## Sample Set

Run the checklist on at least five notes before making a decision:

| Sample | Required mix |
| --- | --- |
| N1 | Short conceptual note, 3-5 headings |
| N2 | Long dense note, 8+ headings |
| N3 | Note with nested headings |
| N4 | Note with at least one failed or missing Section cue |
| N5 | Note from a real recurring use case |

Optional extra samples are encouraged when a misleading hook appears. Do not edit the production note or cached Section cue data to make a sample pass.

## Setup

1. Install the current Hook Mode branch in Obsidian.
2. Generate or refresh Section cues for each sample note.
3. Confirm Cue display defaults to Cornell unless Hook rail was intentionally saved as the preference.
4. Test in light theme, dark theme, and one community theme.
5. If reduced motion is available in the OS, enable it for one pass and confirm Hook Mode remains usable.

## Per-Note Checklist

Copy this table once per note.

| Check | Pass criteria | Result | Notes |
| --- | --- | --- | --- |
| Visual clarity | A new user can identify the hook rail as section navigation within 10 seconds. |  |  |
| Section alignment | Every visible hook card maps to the adjacent or focused note section without needing section numbers. |  |  |
| Summary synthesis | The bottom synthesis card reads as a whole-note takeaway, not as another section cue. |  |  |
| Theme safety | Hook cards, focus states, failed cards, and summary text remain readable in all tested themes. |  |  |
| Readability | Long hook titles wrap inside cards without clipping, horizontal scrolling, or losing the section relationship. |  |  |
| Scan speed | The evaluator can find a target section at least as fast in Hook rail as in the Cornell card display. |  |  |
| Fidelity | Hook title preserves the original question's answer intent. |  |  |
| Misleading-copy incidents | Any distorted, vague, or over-broad hook title is captured below. |  |  |

## Timing Pass

Use the same target section in the Cornell card display and Hook rail.

| Note | Target section | Cornell time | Hook rail time | Faster/clearer? | Notes |
| --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |

Timing does not need lab precision. The useful signal is whether Hook rail helps a real reader reorient faster or at least with less friction.

## Misleading Hook Log

Record every misleading-copy incident. A hook is misleading when it changes the original question's answer intent, points to the wrong section concept, omits the key constraint, or becomes too vague to recover the section's purpose.

| Note | Section | Original question | Hook title | Incident type | Severity | Suggested deterministic fix |
| --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  | distorted intent / wrong concept / missing constraint / too vague | low / medium / high |  |

## Scoring Summary

After all notes are evaluated, fill this summary.

| Metric | Count or score |
| --- | --- |
| Notes evaluated |  |
| Hook cards evaluated |  |
| Misleading hook count |  |
| Misleading hook rate |  |
| Notes with alignment problems |  |
| Notes with theme/readability problems |  |
| Notes where Hook rail was faster or clearer |  |
| Notes where Cornell was clearly better |  |

Compute misleading hook rate as:

```text
misleading hook count / hook cards evaluated
```

## Decision Gate

Choose exactly one outcome and record evidence.

### Keep Deterministic Hook Titles

Choose this when all are true:

- Misleading hook rate is under 5%.
- No high-severity misleading-copy incidents appear.
- Section alignment, readability, summary synthesis, and theme safety pass on every required sample.
- Hook rail is faster or clearer than Cornell mode on at least half of the samples, and is not clearly worse on more than one sample.

Decision: keep the current deterministic transform and continue improving only presentation, interaction, or CSS issues.

### Tighten Deterministic Transforms

Choose this when any are true:

- Misleading hook rate is 5-10%.
- Incidents cluster around fixable text patterns such as trailing clauses, vague pronouns, overly long titles, or missing qualifiers.
- Users prefer the original question for a subset of cards, but the issue is pattern-specific rather than conceptual.

Decision: open a small deterministic-transform issue. Keep provider prompts, schemas, cache shape, and migrations unchanged.

### Open A Provider-Copy Plan

Choose this when any are true:

- Misleading hook rate is over 10%.
- Two or more note types show repeated fidelity problems that simple normalization cannot fix.
- Evaluators frequently need a different short title than the original question can deterministically provide.
- Hook rail is clearer visually, but copy quality blocks confident use.

Decision: open a separate provider-contract plan for generated hook variants. That future plan must cover schema, prompt, cache compatibility, migration, fallback behavior, and evaluation fixtures before any production provider changes are implemented.

## Decision Record

| Field | Entry |
| --- | --- |
| Evaluation date |  |
| Evaluator(s) |  |
| Branch/build |  |
| Decision | keep deterministic / tighten deterministic / open provider-copy plan |
| Evidence |  |
| Follow-up issue or plan |  |
