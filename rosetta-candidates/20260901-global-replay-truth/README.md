# Global replay truth contract

Status: **migrations 01-06 are behavior-validated and installed in the isolated
production replay substrate. Migration 06 corrects the inherited
all-sources-must-parse interpretation and passed isolated compilation,
contract, rollback-only behavior, manifest, promotion-gate, and stale-baseline
validation before installation. The v2.5.28 candidate was not published;
production remains on v2.5.11**.

This packet replaces source-specific replay and promotion decisions with one
corpus-wide invariant:

- every authorized source receives an immutable observed disposition;
- campaign completion means every source is accounted for;
- source replay pass means every source completed successfully;
- rejection, deferral, timeout, retry exhaustion, and terminal failure are
  explicit source nonpasses and are never relabeled as source passes;
- candidate compatibility is a separate fact: every production-admissible
  source must still complete, while a source that production did not admit may
  truthfully reject or deterministically defer;
- timeout, retry exhaustion, terminal worker failure, a compatibility
  regression, or an unexplained object-field diff blocks promotion;
- no expected outcome, correction label, or human disposition can convert a
  nonpass or regression into a pass; and
- publication requires the same global rule to succeed for the entire sealed
  corpus, with complete prior-output diffs and no literal source identity in
  the parser closure.

Regression documents may prove behavior in tests. They do not authorize a
branch in production logic.

## Migration order

1. `01_truthful_campaign_dispositions.sql` separates complete accounting from
   universal pass and records every terminal source outcome.
2. `02_observed_outcomes_only.sql` makes historical per-source expectations
   advisory and binds what the engine actually observed.
3. `03_universal_manifest_and_diff.sql` seals an all-completed corpus contract
   and derives diff status from evidence rather than caller labels.
4. `04_universal_promotion_gate.sql` freezes evidence during publication,
   enforces clean global validation/diffs, disables legacy exception gates,
   and replaces the v2.5.28 publication gate.
5. `05_terminal_campaign_result_integrity.sql` makes every terminal campaign
   state explicitly pass or nonpass and prevents blocked or stopped campaigns
   from retaining the ambiguous result `pending`.
6. `06_truthful_mixed_outcome_compatibility.sql` separates source outcomes from
   candidate compatibility, seals observed outcomes without per-source
   exceptions, freezes the exact current-production control baseline, and
   requires full diffs for every production-admissible member.

Run the byte-level checks with:

```bash
python3 tests/static_checks.py
```

Run `tests/01_contract.sql` only after migrations 01–06 have been installed in
an isolated database containing the replay substrate.

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

The production evaluation is recorded in
`tests/PRODUCTION_REPLAY_RESULTS.json`. It was stopped after 737 completed, 590
rejected, and one timed-out source. The remaining 10,556 sources are explicitly
unprocessed, not passed. Of the 590 rejections, 149 were exact sources that the
current production generation had admitted; those are direct compatibility
regressions. The other 441 rejections were on sources with no exact
production-admissible control and remain truthful source nonpasses, not
automatic candidate failures. The timeout is also a promotion blocker.

v2.5.28 is still blocked because the observed prefix already contains 149
compatibility regressions and one timeout. A future candidate must account for
the entire immutable snapshot, preserve every production-admissible source,
and disclose every rejected or deferred source without calling it parsed.
