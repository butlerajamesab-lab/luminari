# Rosetta 2.5.13 controlled repair candidate

## Result

This packet replaces the drifting 2.5.x patch cycle with one isolated,
corpus-replayable candidate. It does **not** modify Rosetta 2.5.11 in place,
publish objects, promote a registry row, cut over traffic, or touch production.
Rosetta remains its own decomposition platform: Docket Room supplies exact
law/version artifacts upstream, and this repair does not restore Docket Room.

The end state is intentionally binary:

- either every member of the same immutable corpus is truthfully accounted for
  as completed, rejected, deferred, timed out, or failed; every completed run
  has exact source/run/output binding; every exact currently admissible control
  remains compatible; complete object-field diffs, seven correction-specific
  controls, quarantine replay, and explicit human authorization pass; or
- the candidate stays unpublished. Full accounting is mandatory; universal
  parse success is not claimed or required.

## Universal corrections

| Lane | Boundary | Candidate behavior |
|---|---|---|
| C1 | actor length | Applies the measured 1,024-character guard to the **decomposed actor**, not to the whole condition/scaffold; overflow is blocking and never truncated. |
| C2 | actor sanity | Blocks navigation chrome, action-history date chains, HTML entities, U+FFFD, amendatory scaffolding, and multi-modal actor capture. |
| C3 | source acquisition and projection | Identity text may enter directly. Every transformed or non-text source requires a generic receipt binding media type, extractor, raw bytes, extracted text, projection verification, and residue checks. A non-null reference date requires a value-bound provenance receipt; without one, the candidate rejects the run instead of inferring truth from a calendar cutoff. No jurisdiction, bill, run, file, or observed date is embedded in parser logic. |
| C4 | spans | Uses occurrence-aware binding and records an explicit resolved/ambiguous/unresolved state for workflow, accountability, override, definition, **and help** objects. |
| C5 | segmentation and decomposition | Preserves person-shaped middle initials as part of one normative actor while retaining structural-label sentence boundaries, then separates leading condition, amendatory scaffold, actor, modal, action, and trailing condition while preserving exact actor offsets. |
| C6 | polarity | Mixed positive/negative modal clauses create a blocking repair instead of being silently retyped; negative modal text is preserved. |
| C7 | decoding | Requires a charset receipt bound to the exact content hash; replacement characters require an explicit manual-literal disposition and block span certainty. |

The convergence candidate in `migrations/17_convergence_candidate_2513.sql`
composes all seven lanes. Individual lanes remain present so a corpus replay can
attribute changes instead of hiding several variables in one patch.

## Continuity and durability controls

- Source registration, attempt claim, execution, and finalization are separate
  committed transactions.
- A source expectation declares one exact terminal outcome: completed,
  rejected with exact code, or deferred because of an immutable byte threshold.
- A sealed manifest binds every member's content identity, expected outcome,
  prior admissible control run, and quarantine status.
- Every terminal candidate member receives an immutable
  source → attempt → extraction run → output binding.
- Prior admissible members receive a complete full-outer object/field diff,
  covering presence, layer, clause, actor, modal, spans, override fields,
  definition fields, and enforcement fields.
- Same-transaction replay shortcuts and unbound diff shortcuts raise errors.
- Promotion requires gates G1–G11, including exact per-source configuration,
  at least one exact negative control for each C1–C7 lane, all 1,038 supplied
  quarantine run IDs, no unexplained diffs, dispositioned regressions, and one
  fully identity-bound human authorization.
- “Promotion” and “cutover” functions write internal request/decision receipts
  only. This packet contains no production publication operation.

## Security boundary

`migrations/18_candidate_security_lockdown.sql` revokes schema/table/sequence/
function privileges from `PUBLIC`, `anon`, and `authenticated`, enables RLS on
every candidate/replay table, and grants access to `service_role` only when that
role exists. The candidate and replay schemas are internal, not browser-facing.

## Current-build verification performed here

These checks were actually executed against the bytes in this packet:

- Python compilation for all generator, runner, and test modules: pass.
- Generator determinism over migrations 02–10 and 17: pass across consecutive
  runs.
- Captured 2.5.11 registry manifest: SHA-256
  `3602eb80fee71a4009bf7a04c521fec62e2d1f17f8ea5b027500905cd8366639`.
- Control closure reverse-rename fidelity: 51/51 captured function bodies,
  zero MD5 differences.
- SQL lexical integrity: 30 migration/test SQL files balanced.
- Static production-write scan: zero production-schema mutation paths outside
  the read-only capture migration.
- Quarantine evidence: 1,038 unique run IDs; SHA-256
  `13dd88b0519f6ee1d36189aa4f45b4acd0fc0e499a37a3b089f12666c53a476e`.
- Package checksums: generated and reverified by `tools/build_package.py`.

## Historical bounded runtime receipt

The source-locked August 24 candidate was exercised on the non-production
Supabase preview branch `rosetta-corpus-continuity-20260822` (PostgreSQL 17).
Its immutable machine-readable receipt is
`tests/SUPABASE_BRANCH_VALIDATION_RESULTS.json`. It is retained as historical
evidence and is bound to the earlier generated migration hashes recorded under
`historical_runtime_validation` in `PACKAGE_MANIFEST.json`; it is not current
runtime proof for regenerated SQL.

- Twenty migration files compiled in dependency order.
- SQL tests 01–07 and the security test passed. The restored diff/G6
  assertions were executed after they were added.
- A forced statement timeout became a durable `timed_out` receipt with SQLSTATE
  `57014` and created no fake extraction-run binding.
- Control, C1–C7, and the composed 2.5.13 candidate were replayed against the
  same exact-source fixture. Claim, execute, staged-state observation,
  finalization, and proof occurred across committed transaction boundaries.
- All nine runs were `succeeded` / `completed` / `admissible`, with exact
  source/run/output bindings and seven structural objects per lane.
- The C4/convergence validator regression discovered during this run is fixed:
  both now report 10 expected spans, 10 actual spans, zero bad spans, and zero
  span-hash mismatches when a help object is present.
- Candidate security checks report zero missing-RLS tables, zero PUBLIC execute
  grants, zero PUBLIC schema grants, and zero caller-mutable function
  `search_path` values. Supabase reports no security WARN or ERROR findings for
  these schemas; its 17 INFO notices are the intentional RLS-with-no-policy
  posture of deny-all internal tables.

This was a bounded fixture/runtime result for the source-locked earlier bytes.
The current repair must pass the isolated PostgreSQL 17 pull-request job before
review. Neither run stands in for the immutable full-corpus experiment.

## Not claimed

No fresh full real-corpus replay, semantic acceptance across all jurisdictions and
source formats, complete G1–G11 promotion-gate success, promotion, deployment,
or production cutover has occurred. The historical runtime result above covers
one exact synthetic source and bounded control fixtures only. Production was
not mutated, and the preview branch was not merged.

## Required next experiment

1. Create an empty disposable PostgreSQL database or Supabase branch.
2. Run `python3 tests/capture_evidence.py`; the runner refuses a target that
   contains `public.extraction_run` or preexisting package schemas and writes
   the current transcript outside the checksummed packet.
3. Import the immutable corpus sources and their exact 2.5.11 control runs into
   the isolated mirror.
4. Load `evidence/Rosetta Quarantine Run IDs — 2026-08-23.txt` with
   `tools/load_quarantine_evidence.py`.
5. Declare every member's exact expected outcome, seal the complete corpus, and
   execute `tools/replay_manifest_worker.py`.
6. Review every object-field diff. Unexplained changes fail; regressions require
   evidence-backed disposition.
7. Only after the entire replay passes may a human create the identity-bound
   promotion authorization and internal promotion request.

That is the experiment. Until it finishes, this is a repaired **candidate**, not
a claim that Rosetta production is fixed.
