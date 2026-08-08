# Intake Shadow-Path Repair — 2026-08-08

This branch repairs user-visible controls that still bypass the governed Universal Intake Spine.

Confirmed shadow paths from live testing:

- Document Detail `Re-analyze` -> legacy `documents.reanalyze` / tone-report path.
- Control Room `Run Analysis` -> legacy Viability -> Strategy -> Assembly -> Pattern pipeline, with hard-coded `federal` jurisdiction and `Date.now()` incident date.
- Mission Control live-intake surfaces do not yet reflect the live Intake Spine session/receipts.

Constitutional target:

- Upload remains preservation-only.
- Canonical case analysis is explicit Universal Intake Spine execution.
- Downstream strategy, pattern, filing, or other engines remain separately named downstream tools and may not masquerade as Intake.
- No AI/LLM labels or probabilistic analysis claims are permitted on the canonical deterministic path.

Current repair status:

- Document Detail no longer invokes legacy reanalysis; its analysis action hands off to the case-level governed Intake Spine control.
- Remaining Control Room and Mission Control shadow paths are tracked on this branch until reconciled.
