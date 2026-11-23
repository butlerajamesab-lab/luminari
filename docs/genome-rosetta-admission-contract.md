# Genome ← Rosetta admission contract (added layer)

Status: proposed, 2026-11-23. Nothing here changes the existing quarantine.

## What stays exactly as it is
- `server/civic-genome-rosetta-publication-quarantine.ts` is not edited. Its answer for everything stays "quarantined".
- The V12-named target sync, the V15 target row from 2026-11-21, and every existing admission helper stay in place.

## What is added
One admission receipt per Rosetta result. A Genome write is allowed only when the quarantine is satisfied by **that exact result's** verified admission receipt. No receipt, no write — the same as today. Removing this layer returns the system to today's state.

## The six proofs (from the quarantine's own requirement)

| # | Proof | How it is checked | Live evidence today (57 V15 decompositions) |
|---|---|---|---|
| 1 | Source bytes | Recompute SHA-256 of Rosetta `source_document_content.source_text`; must equal Rosetta's stored hash, the decomposition's hash, and Genome's `receipt_json.source_content_hash` | 57 / 57 equal across both databases |
| 2 | Source identity | Genome version's `rosetta_source_document_id` resolves to exactly one Rosetta source content row with that hash (`resolve_v12_source_content`) | 57 / 57 map to one Genome version each |
| 3 | Selected runtime and installed ruleset | `current_execution_target` = `rosetta-rule-ref-v15`; registry `ruleset_sha256` = installed `rosetta_rule_v15.ruleset_sha256()` = decomposition's `ruleset_sha256`; Genome target row names the same ruleset | 57 / 57 equal; Genome target names V15 since 2026-11-21 |
| 4 | Exact extraction run | One `rosetta_rule_out.decomposition` row for (source_content_id, ruleset_version) with outcome `decomposed`, no hold receipt, no failure receipt | 57 decomposed, 0 holds, 0 failures |
| 5 | Output hash | Canonical SHA-256 over ordered units and sections (`v12_output_sha256`), recorded in the receipt | Computable for all 57 |
| 6 | Independent certification | Computed outside the engine: every unit's span re-read from the source bytes and re-hashed; spans in bounds; unit and section counts equal the decomposition's counts. Persisted as an append-only receipt in Lighthouse, then a Prism receipt on the assembled result before anything is labeled verified | Recomputed now: 2,656 / 2,656 units match their source slices across all 57 documents |

## Receipt rules
- Append-only table in Lighthouse; a trigger refuses update and delete (the guard the semantic-clause tables never had).
- Each receipt names: source_content_id, source hash, ruleset version and hash, output hash, unit and section counts, checker version, checked_at.
- A changed source hash, a different ruleset, a missing run, or any unit slice mismatch produces a refusal receipt, never an admission.

## Scope of the first run
Five items, taken by the worker in its own order from results that already pass proofs 1–5, through the existing Prism queue limit. Each step's receipt chains to the previous one by hash.

## Undo
Turn off the admission layer's switch: every Genome write path returns to quarantined. Receipts remain as history.
