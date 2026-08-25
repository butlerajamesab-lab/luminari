# Kimi Luminari Spec Review packet reconciliation — 2026-08-25

## Disposition

The uploaded ZIP is preserved as a dated evidence packet. Its SQL batches are **not** production migrations and must not be replayed as current state. The packet combines an earlier platform snapshot with a later SAIS/contact-enrichment ledger, so the files remain useful only when their capture order is explicit.

- Uploaded ZIP: `Kimi_Agent_Luminari Spec Review(3).zip`
- ZIP SHA-256: `3ce42c689eab9fb3ae049379c01e4548f0de8df8b3f5cbdcd42d4b3fbb2dc83f`
- ZIP members: 21
- ZIP integrity: pass
- Embedded checksum manifest: none
- Repository checksum manifest: `SOURCE_SHA256SUMS`

## Internally supported evidence

- The CSV and JSON table snapshots agree on all 582 captured tables and total 2,177,569 rows.
- The PASS3 expected-count totals recompute exactly across 20 states.
- The PASS3 name-hash map has 670 unique, well-formed 32-hex keys and 670 unique state/name pairs.
- The fourteen SQL batches contain 164 unique `sais_resources` rows and 164 unique `sais_resource_deadlines` rows.
- Live production contains all 328 referenced rows, with no missing IDs, no orphan deadlines, and no missing official contact in this 164-row source subset.
- The contact-enrichment ledger's seven fills, GOIA normalization, 34-row phone-format cleanup, and unresolved BIA counts were reproduced by read-only live probes.

## Point-in-time drift

A fresh exact count after the security merge found 583 public tables and 2,225,184 public-table rows. Relative to the packet snapshot:

- one table was added: `sais_resource_deadlines` with 291 rows;
- 39 table counts changed;
- total row growth was 47,615;
- `sais_resources` moved from 0 to 601;
- the current exact snapshot is `audit/lighthouse_exact_row_counts_current_20260825.json`.

The packet's “148 public views” headline is not supported by the current catalog, which has 224 public views. Because the packet contains no view inventory, the historical 148 figure cannot be independently reconstructed.

Three of the 328 SQL row images no longer exactly match live state:

1. `d03.sql / SAIS-PC-007 / appeal_deadline` — wording was clarified after ingest.
2. `d03.sql / SAIS-PC-015 / reconsideration_deadline` — wording was clarified after ingest.
3. `r03.sql / SAIS-FC-002 / statutory_authority` — capitalization changed from “seq.” to “Seq.”.

The batches use `ON CONFLICT DO NOTHING`, so replay would neither restore these fields nor provide a truthful reconciliation receipt.

## SAIS integration discontinuity

The data load succeeded, but it did not follow the architecture described in the packet:

- `public.sais_resources`: 601 rows;
- `public.sais_resource_deadlines`: 291 rows;
- `sais_import.import_run`: 1 row;
- `sais_import.source_document`: 26 rows;
- `sais_import.resource_candidate`: 1 row;
- `sais_import.deadline_field`: 0 rows;
- `sais_import.routing_item`: 0 rows;
- `public.v_sais_civic_objects_v1`: 1 row;
- civic-genome nodes bound to `sais_resources`: 0;
- canonical SAIS rows without a civic-genome node: 601.

Therefore “ingested” is true, but “routed into the cohesive wired core” is false. A future convergence operation must reconstruct source-preserving staging, compare the 601 canonical rows against it, and create guarded downstream bindings. It must not duplicate or silently overwrite the current rows.

## Security reconciliation

The packet correctly counted 17 public tables with RLS disabled, but its statement that an anonymous key could read and modify them is false in the current live state:

- RLS-disabled public tables: 17;
- tables with any `anon` table privilege: 0;
- tables with any `authenticated` table privilege: 0.

Migration `20260825221359_harden_lighthouse_definer_surfaces_and_sais_deadlines_v1` is now applied and merged. It made the six flagged views security-invoker, removed browser-role access, enabled RLS on `sais_resource_deadlines`, restricted deadline writes to `service_role`, and pinned the remaining mutable function search path. The post-merge Supabase advisor reports zero security errors; its only warning is the unrelated Auth leaked-password setting.

RLS should still be enabled on the remaining 17 tables as defense in depth, but that is a separate, worker-aware migration—not evidence of a current anonymous ACL exposure.

## Storage report reconciliation

Live storage confirms:

- 422 objects;
- 57,946,728 bytes;
- 318 distinct eTags;
- 104 duplicate copies beyond one canonical copy per hash.

The packet's “27 duplicate groups” does not reconcile with the hash distribution. There are 68 hashes with more than one object: 38 two-copy, 25 three-copy, 4 four-copy, and 1 five-copy groups. No storage objects were deleted. The seven same-name/version conflicts remain review items.

## Merge rule

Preserve every source file and its byte identity. Treat the SQL as a historical receipt, not an executable migration. Do not promote SAIS or Rosetta from this packet. The next operational work is a source-bound SAIS convergence candidate and the separately gated Rosetta 2.5.13 candidate.
