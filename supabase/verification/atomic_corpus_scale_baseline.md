# Atomic corpus scale baseline — 2026-08-11

This is a coverage baseline, not a canonical identity count and not an additive total.

Live Lighthouse observations before the atomic pass:

- `public.unified_resources`: 56,398 broad/overlapping rows
- `public.v_luminari_resource_source_candidates`: 53,603 source-bound resource candidates
- `public.luminari_resource_entities`: 6,890 canonical/readable resource entity rows
- `public.luminari_corpus_candidate_v1`: 11,350 fresh typed candidates
- fresh `candidate_type = 'resource'`: 5,984 rows
- active fresh public resource snapshot: 2,866 resolved identities + 2 held strong-identifier conflicts

Large current Storage artifacts that the first fresh typed pass deliberately did not structurally parse:

- `luminari_full_substrate_handoff.sql`: 19,915,663 bytes; 0 fresh typed candidates
- `v3_13_full_substrate_ingest.sql`: 13,908,350 bytes; 0 fresh typed candidates
- `luminari-all-registries (1).zip`: 6,185,520 bytes; 0 fresh typed candidates
- `luminari_cream_of_crop_substrate.sql`: 368,398 bytes; 0 fresh typed candidates

Large artifact under-extraction example:

- `legislators_260712_013940.docx`: 12,436,369 bytes; only 15 fresh typed candidates in the first pass

The atomic pass must explain these gaps by parsing the current Storage bytes into source-bound atomic rows/records without executing historical SQL or silently promoting those rows into canonical objects.
