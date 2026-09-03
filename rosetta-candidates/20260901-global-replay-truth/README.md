# Global replay truth contract

Status: **migrations 01-06 record the existing replay, disposition, manifest,
and compatibility behavior in the isolated production replay substrate.
Migration 07 implements the truth-first quarantine sweep and passed
rollback-only validation in preview project `fqmgxoicohsvntceslxu` on
2026-09-03. That transaction was rolled back: migration 07 is not installed,
the branch is not merged or deployed, production was untouched, and the
v2.5.28 candidate was not published. Production remains on v2.5.11**.

This packet replaces source-specific replay and promotion decisions with one
corpus-wide invariant:

- campaign membership and the whole-corpus denominator are frozen before work
  begins;
- campaign completion means every authorized source is truthfully accounted
  for, not that every source parsed successfully;
- each source has one durable campaign/source attempt row (`retry_seq = 0`),
  accepts one committed observation, and creates no automatic same-campaign
  retry row after that observation;
- a hard backend crash before a committed outcome leaves parser invocation
  ambiguous; it is never rewritten as proof that the parser did or did not
  run, and process-level exactly-once invocation is not claimed;
- every observed terminal outcome receives an immutable disposition;
- rejection, deferral, timeout, and terminal failure are explicit source
  nonpasses, enter the immutable quarantine stack, and are never relabeled as
  source passes;
- a source nonpass does not stop later members from being attempted;
- quarantine share is measured against the frozen whole-corpus denominator:
  10% emits an early warning and 15% requires generalized pattern review, but
  neither checkpoint aborts the sweep;
- pattern review groups evidence by failure class, document class, provider
  family, and media type, and never authorizes a literal source-specific parser
  branch;
- candidate compatibility is a separate fact: every production-admissible
  source must still complete, while a source that production did not admit may
  truthfully reject or deterministically defer;
- promotion is a separate decision from both accounting and compatibility;
  its declared gates may still block on a timeout, terminal worker failure,
  compatibility regression, or unexplained object-field diff;
- no expected outcome, correction label, or human disposition can convert a
  nonpass or regression into a pass; and
- publication requires complete accounting and complete prior-output diffs,
  with no literal source identity in the parser closure; it does not redefine
  an honestly quarantined source as parsed.

Regression documents may prove behavior in tests. They do not authorize a
branch in production logic.

## Migration order

1. `01_truthful_campaign_dispositions.sql` separates complete accounting from
   universal pass and records every terminal source outcome.
2. `02_observed_outcomes_only.sql` makes historical per-source expectations
   advisory and binds what the engine actually observed.
3. `03_universal_manifest_and_diff.sql` implements the packet's existing
   all-completed manifest/diff policy and derives diff status from evidence
   rather than caller labels. It does not implement the quarantine checkpoint
   policy above.
4. `04_universal_promotion_gate.sql` implements the packet's inherited
   publication policy by freezing evidence, enforcing its validation/diff
   requirements, and disabling legacy exception gates.
5. `05_terminal_campaign_result_integrity.sql` makes every terminal campaign
   state explicitly pass or nonpass and prevents blocked or stopped campaigns
   from retaining the ambiguous result `pending`.
6. `06_truthful_mixed_outcome_compatibility.sql` separates source outcomes from
   candidate compatibility, seals observed outcomes without per-source
   exceptions, freezes the exact current-production control baseline, and
   requires full diffs for every production-admissible member.
7. `07_truth_first_quarantine_sweep.sql` freezes the exact authorized campaign
   membership and denominator before execution, enforces one durable
   campaign/source attempt row (`retry_seq = 0`) and one committed observation,
   records every non-success in the immutable quarantine stack, and keeps
   processing after the 10% warning and 15% generalized whole-stack review
   checkpoints. Its processing result does not decide compatibility or
   promotion. It also exposes a sealed-manifest `truth_observation_*` surface
   for the Render worker: existing attempt identities are reused without a
   retry, historical outcomes cannot skip execution, and the advisory
   finalizer binds what was actually observed.

Migration 07 has rollback-only preview evidence, not installation evidence.
It remains unmerged and undeployed.

Run the byte-level checks with:

```bash
python3 tests/static_checks.py
```

Run `tests/01_contract.sql` only after migrations 01–06 have been installed in
an isolated database containing the replay substrate. Reproducing the recorded
rollback-only migration-07 validation requires a harness that keeps migration
07, `tests/02_truth_first_contract.sql`,
`tests/03_truth_first_behavior.sql`, and
`tests/04_truth_observation_behavior.sql` inside one rollback boundary while
suppressing their embedded transaction terminators. Running migration 07
unchanged executes its own `COMMIT` and is not a rollback-only validation.

## Validation truth

The preview validation proves schema compilation and bounded state-machine
behavior against the seven sources already present on that branch. It includes
an all-pass 3/3 campaign fixture, a truthful 5-pass/1-rejection fixture, an
expired-lease timeout, advisory expectation divergence, injected source-ID
rejection, legacy-gate rejection, and fabricated-pass rejection. Migration 06
adds rollback-only proof that a 5-completed/2-rejected campaign can be
candidate-compatible without claiming that all sources parsed; the same
rejection fails with `P1T03` when an exact current-production admissible control
is present; and a fully accounted campaign with a timeout fails with `P1T02`.
The observed mixed outcomes seal into a verified immutable manifest and pass
the final promotion gate only when a global validation contract is present.
If the current production generation or its exact admissible control set
changes after sealing, the manifest fails closed as stale. Post-rollback
inspection found no retained fixture rows.

That bounded validation is historical evidence for migrations 01-06.

On 2026-09-03, preview project `fqmgxoicohsvntceslxu` successfully compiled
migration 07 and exercised `tests/02_truth_first_contract.sql`,
`tests/03_truth_first_behavior.sql`, and
`tests/04_truth_observation_behavior.sql` in one rollback-only transaction.
The campaign fixture froze an exact bounded v2.5.28 authorization group,
crossed the frozen-denominator checkpoints with synthetic terminal
observations, and verified exactly one `warning_10pct` event and one
`cluster_review_required_15pct` whole-stack review event. It then invoked the
actual combined runner for exactly one post-threshold attempt under a
caller-armed 120,000 ms statement timeout in its own top-level statement,
finalized that staged result into a recognized immutable disposition, verified
that the committed staged attempt was not selected for execution again, and
kept the campaign running. Every other outcome in that campaign fixture was
synthetic and explicitly marked as having skipped parser execution. One of
those synthetic outcomes was a retryable failure staged with an expired
finalization lease; supervision preserved its staged observation, quarantined
it as `failed_terminal` with `P1Q43`, and continued the running campaign
without a parser rerun. After all frozen members were accounted for,
supervision completed the campaign with a truthful `nonpass` /
`completed_with_quarantine` result while leaving promotion not evaluated and
ineligible.

The Render-worker SQL-contract fixture cloned one exact v2.5.13 source inside
the same rollback boundary and deliberately declared the wrong historical
outcome. The sealed-manifest SQL surface still invoked the parser once, created
and bound exactly one successful extraction run, recorded the actual `completed`
outcome, and rejected a second execution with `P1Q44`. Before that invocation,
rollback subprobes also proved that intact sealed membership blocks both
legacy adoption of an expired/ambiguous running identity and creation of a
retry after timeout (`P1Q46`), even before the worker reaches that member. Its configuration hash
matched the extraction run even though the currently installed preview closure
and the repository repair closure use different source-locked configuration
shapes; the closure hash keeps those executable identities distinct.

This is bounded runner-lifecycle and state-machine evidence, not a claim that
the candidate's parser output is correct for the production corpus. It did not
exercise a scheduled executor, hard-crash recovery, or a full production-corpus
sweep, and it does not establish process-level exactly-once parser invocation
across an ambiguous hard backend crash.

Post-rollback inspection found both migration-07 membership tables absent,
the `replay_campaign.attempt_policy` column absent, zero fixture rows, zero
active campaigns, and zero truth-first cron jobs. Production was untouched.
Migration 07 was not installed, and the branch was not merged or deployed. The
machine-readable record is
`tests/TRUTH_FIRST_PREVIEW_VALIDATION_RESULTS.json`.
The Python worker was validated separately by its behavioral unit suite; it was
not run end-to-end against the preview database.

The production evaluation is recorded in
`tests/PRODUCTION_REPLAY_RESULTS.json`. It was stopped after 737 completed, 590
rejected, and one timed-out source. The remaining 10,556 sources are explicitly
unprocessed, not passed and not yet quarantined. The 591 observed non-successes
are 4.97% of the frozen 11,884-source corpus, below the 10% early-warning
checkpoint. Under the operating contract above, their existence would not
justify stopping the sweep even after a checkpoint: all remaining members
would continue toward a truthful terminal disposition. Of the 590 rejections,
149 were exact sources that the current production generation had admitted;
those are direct compatibility regressions. The other 441 rejections were on
sources with no exact production-admissible control and remain truthful source
nonpasses, not automatic candidate failures. The timeout is also a promotion
blocker.

v2.5.28 is still blocked because the observed prefix already contains 149
compatibility regressions and one timeout. A future candidate must account for
the entire immutable snapshot, preserve every production-admissible source,
and disclose every rejected or deferred source without calling it parsed.
